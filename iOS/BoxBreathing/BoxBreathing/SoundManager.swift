import AVFoundation
import UIKit // Required for UIImpactFeedbackGenerator and Timer

// Assuming BreathingPhase enum is defined elsewhere, e.g.:
enum BreathingPhase {
    case inhale
    case exhale
    case holdFull
    case holdEmpty
}

class SoundManager {
    // Persistent Audio Engine
    private let engine = AVAudioEngine()
    private let playerA = AVAudioPlayerNode()
    private let playerB = AVAudioPlayerNode()
    
    // Track active player for crossfading
    // 0 = A is active, 1 = B is active
    private var activePlayerIndex = 0
    
    // Buffers
    private var inhaleBuffer: AVAudioPCMBuffer?
    private var exhaleBuffer: AVAudioPCMBuffer?
    private var holdBuffer: AVAudioPCMBuffer?
    private var gongBuffer: AVAudioPCMBuffer?
    
    init() {
        // Did not start automatically to prevent freeze
        // Call startInitialization() manually
    }
    
    func startInitialization() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            // 1. Configure Session FIRST (Critical for no-glitch start)
            self.configureAudioSession()
            
            // 2. Setup Engine Graph
            self.setupEngine()
            
            // 3. Generate Buffers
            let mixer = self.engine.mainMixerNode
            let format = mixer.outputFormat(forBus: 0)
            
            let inhale = self.generateSignalBuffer(frequency: 262.0, format: format, duration: 2.5)  // C4
            let exhale = self.generateSignalBuffer(frequency: 196.0, format: format, duration: 2.5)  // G3
            let hold = self.generateSignalBuffer(frequency: 220.0, format: format, duration: 2.5)    // A3
            let gong = self.generateGongBuffer(format: format)
            
            // 4. Start Engine (Late start)
            do {
                self.engine.prepare()
                try self.engine.start()
            } catch {
                print("Audio Engine Start Error: \(error)")
            }
            
            // 5. Notify Main Thread
            DispatchQueue.main.async {
                self.inhaleBuffer = inhale
                self.exhaleBuffer = exhale
                self.holdBuffer = hold
                self.gongBuffer = gong
                // Generate and schedule silence loop
                self.setupSilenceLoop(format: format)
                
                self.onReady?()
            }
        }
    }
    
    // Silence Player for Background Keep-Alive
    private let silencePlayer = AVAudioPlayerNode()
    private var silenceBuffer: AVAudioPCMBuffer?
    
    private func setupSilenceLoop(format: AVAudioFormat) {
        // Create 1 second of "silence" (actually very low noise to prevent suspension)
        let frameCount = AVAudioFrameCount(format.sampleRate * 1.0)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
        buffer.frameLength = frameCount
        
        // Fill with white noise at extremely low amplitude (0.001)
        // iOS sometimes optimizes out pure zero buffers, confusing the "Now Playing" status
        if let channels = buffer.floatChannelData {
            for ch in 0..<Int(format.channelCount) {
                let channelData = channels[ch]
                for i in 0..<Int(frameCount) {
                    channelData[i] = Float.random(in: -0.001...0.001)
                }
            }
        }
        
        self.silenceBuffer = buffer
        
        // Attach and Connect
        engine.attach(silencePlayer)
        engine.connect(silencePlayer, to: engine.mainMixerNode, format: format)
    }
    
    func startSilence() {
        guard let buffer = silenceBuffer else { return }
        if !silencePlayer.isPlaying {
            silencePlayer.scheduleBuffer(buffer, at: nil, options: .loops, completionHandler: nil)
            silencePlayer.volume = 0.001 // Non-zero but inaudible, just in case
            silencePlayer.play()
        }
    }
    
    func stopSilence() {
        silencePlayer.stop()
    }
    
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: .mixWithOthers)
            try AVAudioSession.sharedInstance().setActive(true)
            setupInterruptionObserver()
        } catch {
            print("Failed to set audio session: \(error)")
        }
    }
    
    private func setupInterruptionObserver() {
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] notification in
            guard let userInfo = notification.userInfo,
                  let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
            
            if type == .ended {
                try? AVAudioSession.sharedInstance().setActive(true)
                try? self?.engine.start()
                self?.startSilence() // Resume keep-alive
            }
        }
    }
    
    private func setupEngine() {
        // Attach Nodes
        engine.attach(playerA)
        engine.attach(playerB)
        
        let mixer = engine.mainMixerNode
        let format = mixer.outputFormat(forBus: 0)
        
        // Connect both players to mixer
        engine.connect(playerA, to: mixer, format: format)
        engine.connect(playerB, to: mixer, format: format)
    }
    
    // Callback when buffers are ready
    var onReady: (() -> Void)?
    
    // MARK: - Playback Control
    
    func playPhaseStr(_ name: String) {
        if !engine.isRunning { try? engine.start() }
        
        var targetBuffer: AVAudioPCMBuffer?
        
        switch name {
        case "Inhale":
            targetBuffer = inhaleBuffer
        case "Exhale":
            targetBuffer = exhaleBuffer
        case "Hold":
            targetBuffer = holdBuffer // Play signal for Hold too
        default:
            targetBuffer = nil
        }
        
        // Play as a cue (One-shot, not loop)
        playCue(buffer: targetBuffer)
    }
    
    private func playCue(buffer: AVAudioPCMBuffer?) {
        guard let buffer = buffer else { return }
        
        // Ping-Pong Logic: Toggle between Player A and B
        // This avoids hard 'stop()' calls which cause clicks/pops
        let nextPlayer = activePlayerIndex == 0 ? playerB : playerA
        
        // Fade out old player nicely
        // (Optional: Volume ramp could be added here, but simple stop works better on idle player)
        // Actually, just scheduling on the NEW player overlaps nicely.
        // We only stop the old player if it is still playing something long to prevent buildup.
        // For short cues, overlapping is actually smoother and more meditative.
        
        // Play new cue on Next Player
        nextPlayer.stop() // Ensure it's clear
        nextPlayer.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        nextPlayer.volume = 1.0
        nextPlayer.play()
        
        // Swap index
        activePlayerIndex = activePlayerIndex == 0 ? 1 : 0
    }

    func playGong() {
        if !engine.isRunning { try? engine.start() }
        // Gong always cuts everything else for impact
        stopImmediate()
        
        guard let gong = gongBuffer else { return }
        
        playerA.scheduleBuffer(gong, at: nil, options: [], completionHandler: nil)
        playerA.volume = 1.0
        playerA.play()
    }
    
    func stop() {
        // Just stop immediately
        stopImmediate()
    }
    
    private func stopImmediate() {
        playerA.stop()
        playerB.stop()
    }
    
    // MARK: - Generators (Helpers)
    
    private func generateSignalBuffer(frequency: Double, format: AVAudioFormat, duration: Double) -> AVAudioPCMBuffer? {
        let frameCount = AVAudioFrameCount(format.sampleRate * duration)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return nil }
        buffer.frameLength = frameCount
        let channels = buffer.floatChannelData!
        let leftChannel = channels[0]
        
        for i in 0..<Int(frameCount) {
            let t = Double(i) / format.sampleRate
            // Pure Sine - calming tone
            let wave = sin(2.0 * Double.pi * frequency * t)
            
            // Envelope: Very Soft Attack (0.5s), Short Hold (0.3s), Long Decay
            // Creates a gentle, calming "ooooommm" feeling without mystical overtones
            let envelope: Double
            if t < 0.5 {
                envelope = t / 0.5 // Very soft, slow attack
            } else if t < 0.8 {
                envelope = 1.0 // Short hold
            } else {
                // Faster exponential decay for shorter duration (2.5s)
                let decayT = t - 0.8
                envelope = exp(-decayT * 3.0) // Decay constant increased to 3.0 for faster fade
            }
            
            // Fade out end to zero (safety clip)
            let frameCountInt = Int(frameCount)
            let fadeOutIndex = Int(Double(frameCount) * 0.98) // Only fade very last 2%
            
            let finalGain: Float
            if i > fadeOutIndex {
                let remaining = Float(frameCountInt - i)
                let fadeLength = Float(frameCountInt - fadeOutIndex)
                finalGain = remaining / fadeLength
            } else {
                finalGain = 1.0
            }
            
            leftChannel[i] = Float(wave * envelope) * finalGain * 0.35 // Quieter for deep relaxation
        }
        return buffer
    }
    
    private func generateGongBuffer(format: AVAudioFormat) -> AVAudioPCMBuffer? {
        // Long, calming gong: 7 seconds with slow fade
        let duration = 7.0
        let frameCount = AVAudioFrameCount(format.sampleRate * duration)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return nil }
        buffer.frameLength = frameCount
        
        let channels = buffer.floatChannelData!
        let leftChannel = channels[0]
        
        for i in 0..<Int(frameCount) {
            let t = Double(i) / format.sampleRate
            
            // Deep, warm frequencies for calming effect (matching Web App)
            // Base ~100Hz (deep rumble) with harmonics
            let f1 = sin(2.0 * Double.pi * 100.0 * t) * 0.5   // Fundamental (deep)
            let f2 = sin(2.0 * Double.pi * 150.0 * t) * 0.3   // 5th harmonic
            let f3 = sin(2.0 * Double.pi * 200.0 * t) * 0.15  // Octave
            
            // Envelope: Slow, meditative decay
            // exp(-t * 0.6): at 7s -> e^-4.2 ~ 0.015 (quiet but audible tail)
            // Provides a long, peaceful fade
            let decay = exp(-t * 0.6)
            let attack = min(1.0, t * 8.0) // Soft attack over ~125ms
            let envelope = attack * decay
            
            // Force smooth zero at very end to prevent any click
            let frameCountInt = Int(frameCount)
            let fadeOutIndex = Int(Double(frameCount) * 0.92)
            
            let finalGain: Float
            if i > fadeOutIndex {
                let remaining = Float(frameCountInt - i)
                let fadeLength = Float(frameCountInt - fadeOutIndex)
                finalGain = remaining / fadeLength
            } else {
                finalGain = 1.0
            }
            
            leftChannel[i] = Float((f1 + f2 + f3) * envelope) * finalGain
        }
        return buffer
    }
}
