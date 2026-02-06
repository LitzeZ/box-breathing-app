import SwiftUI
import Combine

#if os(iOS)
import AudioToolbox
import AVFoundation
import UIKit
#elseif os(watchOS)
import WatchKit
import Foundation
#endif

class BreathEngine: ObservableObject {
    // --- Published State ---
    @Published var isRunning: Bool = false
    @Published var currentPattern: BreathingPattern {
        didSet { 
            UserDefaults.standard.set(currentPattern.id, forKey: "savedPatternId")
            #if os(iOS)
            sendSettingsUpdate()
            #endif
        }
    }
    @Published var sessionMinutes: Int {
        didSet { 
            UserDefaults.standard.set(sessionMinutes, forKey: "savedSessionMinutes")
            #if os(iOS)
            sendSettingsUpdate()
            #endif
        }
    }
    @Published var duration: Double {
        didSet { 
            UserDefaults.standard.set(duration, forKey: "savedDuration")
            #if os(iOS)
            sendSettingsUpdate()
            #endif
        }
    }
    
    // Settings (with persistence)
    @Published var isZenMode: Bool {
        didSet {
            UserDefaults.standard.set(isZenMode, forKey: "savedZenMode")
            #if os(iOS)
            sendSettingsUpdate()
            #endif
            
            if isZenMode && isRunning {
                // Start immediate fadeout (no delay) when manually toggled
                startZenModeIdleTimer(delay: 0.0)
            } else if !isZenMode {
                idleTimer?.invalidate()
                zenModeOpacity = 1.0
            }
        }
    }
    @Published var isMuted: Bool {
        didSet { UserDefaults.standard.set(isMuted, forKey: "savedMuted") }
    }
    @Published var isHapticsEnabled: Bool {
        didSet { 
            UserDefaults.standard.set(isHapticsEnabled, forKey: "savedHaptics")
            #if os(iOS)
            sendSettingsUpdate()
            #endif
        }
    }
    
    // Zen Mode Opacity (0 = hidden, 1 = visible) - for smooth fade
    @Published var zenModeOpacity: Double = 1.0
    
    // Animation State
    @Published var currentPhaseIndex: Int = 0
    @Published var phaseProgress: Double = 0.0
    @Published var cycleProgress: Double = 0.0
    @Published var countdownText: String = ""
    @Published var phaseName: String = ""
    @Published var remainingSessionSeconds: Int = 0
    
    // Session Statistics (persisted)
    @Published var weeklyMinutes: Int = 0
    @Published var currentStreak: Int = 0
    
    private let dailyLogKey = "dailyMinutesLog"
    private let streakKey = "currentStreak"
    private let lastStreakDateKey = "lastStreakDate"
    
    // Audio Readiness
    @Published var isAudioReady: Bool = false
    
    // Animation Triggers
    @Published var cycleResetTrigger: Bool = false
    
    // Computed property for CircleView animation
    var currentPhaseDuration: Double {
        let unitDuration = duration / currentPattern.ratios[0]
        let currentRatio = currentPattern.ratios[currentPhaseIndex]
        return unitDuration * currentRatio
    }
    
    // --- Internal Logic ---
    private var timer: Timer?
    private var phaseStartTime: TimeInterval = 0
    private var sessionEndTime: Date?
    private var idleTimer: Timer?
    private var lastInteractionTime: Date = Date()
    private var isFirstCycle: Bool = true // Track first start to prevent initial wobble
    
    #if os(iOS)
    private let soundManager = SoundManager()
    #endif
    
    init() {
        // Load saved pattern or default to Box
        let savedPatternId = UserDefaults.standard.string(forKey: "savedPatternId") ?? "box"
        self.currentPattern = BreathingPattern.allPresets.first { $0.id == savedPatternId } ?? BreathingPattern.allPresets.first!
        
        // Load other saved settings with defaults
        self.sessionMinutes = UserDefaults.standard.object(forKey: "savedSessionMinutes") as? Int ?? 15
        self.duration = UserDefaults.standard.object(forKey: "savedDuration") as? Double ?? 6.0
        self.isZenMode = UserDefaults.standard.bool(forKey: "savedZenMode")
        self.isMuted = UserDefaults.standard.bool(forKey: "savedMuted")
        self.isHapticsEnabled = UserDefaults.standard.object(forKey: "savedHaptics") as? Bool ?? true
        
        // Initial UI State (shows pattern name)
        self.phaseName = "\(currentPattern.name) Breathing"
        self.remainingSessionSeconds = sessionMinutes * 60
        
        // Load session stats
        loadStatistics()
        
        #if os(iOS)
        // Listen for Audio Readiness
        soundManager.onReady = { [weak self] in
            DispatchQueue.main.async {
                self?.isAudioReady = true
            }
        }
        
        // Setup Audio Manager (Serialized Async Init)
        soundManager.startInitialization()
        #else
        // WatchOS: No audio to load, ready immediately
        self.isAudioReady = true
        #endif
        
        // Connectivity Init (Shared)
        let _ = ConnectivityManager.shared
        
        // Listen for External Updates (Watch Sync)
        NotificationCenter.default.addObserver(self, selector: #selector(reloadSettings), name: NSNotification.Name("SettingsChangedFromWatch"), object: nil)
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    #if os(watchOS)
    private var session: WKExtendedRuntimeSession?
    #endif
    
    // MARK: - Control Methods
    
    func start() {
        guard !isRunning else { return }
        
        #if os(iOS)
        UIApplication.shared.isIdleTimerDisabled = true
        #endif
        
        isRunning = true
        sessionEndTime = Date().addingTimeInterval(TimeInterval(sessionMinutes * 60))
        
        startBreathingCycle()
        startZenModeIdleTimer() // Begin idle tracking for Zen Mode (default 5s)
        
        #if os(iOS)
        soundManager.startSilence() // KEEP ALIVE
        #endif
    }
    
    func stop() {
        isRunning = false
        timer?.invalidate()
        timer = nil
        idleTimer?.invalidate()
        idleTimer = nil
        
        #if os(iOS)
        UIApplication.shared.isIdleTimerDisabled = false
        #endif
        
        #if os(watchOS)
        session?.invalidate()
        session = nil
        NSObject.cancelPreviousPerformRequests(withTarget: self) // Safety cleanup
        #endif
        
        // Reset UI to Idle (use current pattern name)
        currentPhaseIndex = 0
        phaseName = "\(currentPattern.name) Breathing"
        countdownText = ""
        cycleProgress = 0.0
        phaseProgress = 0.0
        remainingSessionSeconds = sessionMinutes * 60
        zenModeOpacity = 1.0 // Restore visibility
        
        #if os(iOS)
        soundManager.stopSilence()
        soundManager.stop()
        #endif
    }
    
    func toggle() {
        if isRunning {
            stop()
        } else {
            start()
            
            #if os(watchOS)
            // Start Extended Runtime for Background Haptics
            session = WKExtendedRuntimeSession()
            session?.start()
            #endif
        }
    }
    
    // MARK: - Zen Mode Idle Timer
    
    /// Call this from UI on any user interaction to reset idle timer and restore visibility.
    func resetZenModeIdle() {
        zenModeOpacity = 1.0
        startZenModeIdleTimer(delay: 5.0)
    }
    
    private func startZenModeIdleTimer(delay: TimeInterval = 5.0) {
        idleTimer?.invalidate()
        
        guard isRunning && isZenMode else { return }
        
        // Fade out UI over 6 seconds after delay
        idleTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            // Must dispatch to main thread for proper SwiftUI animation
            DispatchQueue.main.async {
                withAnimation(.easeInOut(duration: 6.0)) {
                    self?.zenModeOpacity = 0.0
                }
            }
        }
    }
    
    func setPattern(_ pattern: BreathingPattern) {
        currentPattern = pattern
        // Haptic feedback on pattern change
        if isHapticsEnabled {
            #if os(iOS)
            let generator = UISelectionFeedbackGenerator()
            generator.selectionChanged()
            #elseif os(watchOS)
            WKInterfaceDevice.current().play(.click)
            #endif
        }
        if isRunning { stop() } // Reset on change
    }
    
    // MARK: - Engine Loop
    
    private func startBreathingCycle() {
        currentPhaseIndex = -1
        isFirstCycle = true // Reset flag
        
        // Timer Mode: No phase calculation, just start timer loop
        if currentPattern.isTimerOnly == true {
             isRunning = true 
             // Fix: Update phaseName to pattern name (e.g. "Meditation") so it doesn't show stale text
             phaseName = currentPattern.name
             // Phase logic skipped, only timer updates
        } else {
            nextPhase()
        }
        
        // High frequency timer for smooth animation (60fps)
        timer = Timer.scheduledTimer(withTimeInterval: 0.016, repeats: true) { [weak self] _ in
            self?.updateLoop()
        }
    }
    
    // Using 'updateSearch' name just to match internal thought process, let's rename to updateLoop in Swift
    private func updateLoop() {
        guard isRunning else { return }
        
        // Timer Only Mode (Zen): Skip phase logic, just show session progress
        if currentPattern.isTimerOnly == true {
             updateSessionTimer()
             
             let totalSeconds = Double(sessionMinutes * 60)
             if totalSeconds > 0 {
                 // Ring fills up over session duration
                 cycleProgress = 1.0 - (Double(remainingSessionSeconds) / totalSeconds)
             }
             
             // Show remaining time in center
             let m = remainingSessionSeconds / 60
             let s = remainingSessionSeconds % 60
             countdownText = String(format: "%02d:%02d", m, s)
             
             return // Skip phase logic
        }
        
        let now = Date().timeIntervalSince1970
        let elapsed = now - phaseStartTime
        
        // Calculate Phase Duration
        // Logic: baseDuration corresponds to ratio "1".
        // Example: Box (1,1,1,1) -> All phases = baseDuration.
        // Example: Relax (4,7,8) -> Inhale (4) = baseDuration (e.g. 4s) ?? 
        // Re-evaluating TS logic: unitDuration = baseDuration / preset.ratios[0];
        // So if baseDuration is "4s", and Ratio[0] is 4, unit is 1s.
        // Then Exhale (8) is 8s. 
        
        let unitDuration = duration / currentPattern.ratios[0]
        let currentRatio = currentPattern.ratios[currentPhaseIndex]
        let phaseDuration = unitDuration * currentRatio
        
        if elapsed >= phaseDuration {
            nextPhase()
        } else {
            // Update Progress
            phaseProgress = elapsed / phaseDuration
            let remaining = max(0.0, phaseDuration - elapsed)
            countdownText = String(format: "%.0f", ceil(remaining))
            
            updateCycleProgress(elapsed: elapsed, unitDuration: unitDuration)
            updateSessionTimer()
        }
    }
    
    private func nextPhase() {
        currentPhaseIndex = (currentPhaseIndex + 1) % currentPattern.phases.count
        
        // Trigger visual "snap" animation when cycle restarts
        // Trigger visual "snap" animation when cycle restarts
        if currentPhaseIndex == 0 {
            if isFirstCycle {
                isFirstCycle = false // Don't trigger on first start
            } else {
                // Pulse the trigger: Kick out, then snap back
                cycleResetTrigger = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    self.cycleResetTrigger = false
                }
            }
        }
        
        phaseStartTime = Date().timeIntervalSince1970
        // CRITICAL FIX: Reset progress immediately to prevent UI rendering with stale (1.0) progress from previous phase
        // This stops the "Flash/Twitch" effect at transitions.
        phaseProgress = 0.0 
        
        // Update Text
        // Check if Timer Only (Zen Mode) - suppress phase cues
        if currentPattern.isTimerOnly == true { return }
        
        phaseName = currentPattern.phases[currentPhaseIndex]
        
        // Trigger Sound
        #if os(iOS)
        if !isMuted {
            soundManager.playPhaseStr(phaseName)
        }
        #endif
        
        // Haptics
        if isHapticsEnabled {
            triggerHaptic()
        }
    }
    
    private func updateCycleProgress(elapsed: TimeInterval, unitDuration: Double) {
        let totalCycleUnits = currentPattern.ratios.reduce(0, +)
        let totalCycleDuration = totalCycleUnits * unitDuration
        
        // Calculate time elapsed in previous phases of this cycle
        var timePrior: Double = 0
        for i in 0..<currentPhaseIndex {
            timePrior += currentPattern.ratios[i] * unitDuration
        }
        
        let totalElapsedInCycle = timePrior + elapsed
        cycleProgress = totalElapsedInCycle / totalCycleDuration
    }
    
    private func updateSessionTimer() {
        guard let endTime = sessionEndTime else { return }
        let remaining = Int(endTime.timeIntervalSince(Date()))
        
        if remaining <= 0 {
            // Record stats before stopping (use original session time, not remaining)
            recordSessionComplete(durationMinutes: sessionMinutes)
            stop() // Session Complete
            
            #if os(iOS)
            soundManager.playGong()
            #endif
            
            // Triple vibration at end (if haptics enabled)
            if isHapticsEnabled {
                triggerEndHaptic()
            }
        } else {
            remainingSessionSeconds = remaining
        }
    }
    
    // MARK: - Helpers
    func updateSessionTime(by minutes: Int) {
        sessionMinutes = max(1, sessionMinutes + minutes)
        if !isRunning {
            remainingSessionSeconds = sessionMinutes * 60
        } else if let endTime = sessionEndTime {
            sessionEndTime = endTime.addingTimeInterval(TimeInterval(minutes * 60))
            // Ensure we don't jump to past
            if sessionEndTime! < Date() { sessionEndTime = Date() }
        }
    }

    private func triggerHaptic() {
        if currentPattern.isTimerOnly == true { return }
        
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .heavy)
        generator.prepare()
        generator.impactOccurred()
        #elseif os(watchOS)
        WKInterfaceDevice.current().play(.start)
        #endif
    }
    
    /// Triple haptic pulse for session completion
    private func triggerEndHaptic() {
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .heavy)
        generator.prepare()
        
        // 3 pulses with 200ms spacing
        generator.impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            generator.impactOccurred()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            generator.impactOccurred()
        }
        #elseif os(watchOS)
        WKInterfaceDevice.current().play(.success)
        #endif
    }
    
    // MARK: - Session Statistics
    
    private func loadStatistics() {
        // Load Streak
        currentStreak = UserDefaults.standard.integer(forKey: streakKey)
        
        // Calculate Weekly Minutes from Log
        let log = UserDefaults.standard.dictionary(forKey: dailyLogKey) as? [String: Int] ?? [:]
        weeklyMinutes = calculateWeeklyMinutes(from: log)
        
        // Check if streak is broken (unless it's today)
        let savedDate = UserDefaults.standard.string(forKey: lastStreakDateKey) ?? ""
        let today = formatDate(Date())
        let yesterday = formatDate(Date().addingTimeInterval(-86400))
        
        if savedDate != today && savedDate != yesterday && currentStreak > 0 {
             // Streak broken? Only reset if user opens app after missing a day?
             // Actually, for display purposes, if broken, show 0? 
             // Common practice: Show 0, but maybe don't wipe it until end of day.
             // Let's keep it simple: if savedDate < yesterday, streak is technically 0 for *next* session, but show 0 now.
             if savedDate < yesterday {
                 currentStreak = 0 // Visually 0, will be overwritten on next save
             }
        }
    }
    
    private func recordSessionComplete(durationMinutes: Int) {
        let today = formatDate(Date())
        var log = UserDefaults.standard.dictionary(forKey: dailyLogKey) as? [String: Int] ?? [:]
        
        // 1. Update Daily Log
        let currentDaily = log[today] ?? 0
        log[today] = currentDaily + durationMinutes
        UserDefaults.standard.set(log, forKey: dailyLogKey)
        
        // Update View State
        weeklyMinutes = calculateWeeklyMinutes(from: log)
        
        // 2. Update Streak
        let lastDate = UserDefaults.standard.string(forKey: lastStreakDateKey) ?? ""
        
        if lastDate == today {
            // Already active today, streak doesn't change
        } else {
            let yesterday = formatDate(Date().addingTimeInterval(-86400))
            if lastDate == yesterday {
                currentStreak += 1
            } else {
                currentStreak = 1 // New Streak or Reset
            }
            UserDefaults.standard.set(currentStreak, forKey: streakKey)
            UserDefaults.standard.set(today, forKey: lastStreakDateKey)
        }
    }
    
    // Helper to sum up last 7 days
    private func calculateWeeklyMinutes(from log: [String: Int]) -> Int {
        var total = 0
        let calendar = Calendar.current
        let today = Date()
        
        for i in 0..<7 {
            if let date = calendar.date(byAdding: .day, value: -i, to: today) {
                let key = formatDate(date)
                total += log[key] ?? 0
            }
        }
        return total
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    
    // MARK: - Connectivity / Sync
    
    @objc private func reloadSettings() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            print("Engine: Reloading Settings from Sync...")
            
            // Reload Pattern
            let savedPatternId = UserDefaults.standard.string(forKey: "savedPatternId") ?? "box"
            if self.currentPattern.id != savedPatternId {
                self.currentPattern = BreathingPattern.allPresets.first { $0.id == savedPatternId } ?? BreathingPattern.allPresets.first!
            }
            
            // Reload Values
            self.duration = UserDefaults.standard.object(forKey: "savedDuration") as? Double ?? 6.0
            self.isZenMode = UserDefaults.standard.bool(forKey: "savedZenMode")
            self.isHapticsEnabled = UserDefaults.standard.object(forKey: "savedHaptics") as? Bool ?? true
            self.sessionMinutes = UserDefaults.standard.object(forKey: "savedSessionMinutes") as? Int ?? 15
            
            // Validate Running State
            if !self.isRunning {
                self.remainingSessionSeconds = self.sessionMinutes * 60
            }
        }
    }
    
    private func sendSettingsUpdate() {
        #if os(iOS)
        ConnectivityManager.shared.sendSettings(
            patternId: currentPattern.id,
            duration: duration,
            isZenMode: isZenMode,
            isHapticsEnabled: isHapticsEnabled,
            sessionMinutes: sessionMinutes
        )
        #endif
    }
}
