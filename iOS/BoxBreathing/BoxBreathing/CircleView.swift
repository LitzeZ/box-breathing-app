import SwiftUI

struct CircleView: View {
    @ObservedObject var engine: BreathEngine
    
    var body: some View {
        ZStack {
            // Glow Layer (Subtle, always active during breathing)
            if engine.isRunning {
                Circle()
                    .fill(Color.white.opacity(0.25))
                    .frame(width: 190, height: 190)
                    .blur(radius: 25)
                    .scaleEffect(scaleFactor())
            }
            
            // Main Circle
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [Color.white.opacity(0.9), Color.white.opacity(0.05)]),
                        center: UnitPoint(x: 0.3, y: 0.3), // Offset highlight
                        startRadius: 10,
                        endRadius: 150
                    )
                )
                .frame(width: 190, height: 190)
                .scaleEffect(scaleFactor())
                // No implicit animation: Scale is driven by 60fps timer updates.
                .shadow(color: Color.white.opacity(0.1), radius: 30, x: 0, y: 0)
            
            // Text Overlay (Countdown Number) - Hidden in Zen Mode
            // Logic: Hide if pattern is "Timer Only" OR if global "Zen Mode" (Focus Mode) is enabled
            if engine.isRunning && engine.currentPattern.isTimerOnly != true && !engine.isZenMode {
                Text(engine.countdownText)
                    .font(.system(size: 32, weight: .thin))
                    .foregroundColor(.white)
                    .transition(.opacity)
            }
        }
    }
    
    // MARK: - Animation Logic (Exact Web App Parity)
    
    /// Calculates the circle scale based on current phase and progress.
    /// Uses the exact same math as the web app's `updateUI` function.
    func scaleFactor() -> CGFloat {
        // Idle state
        guard engine.isRunning else { return 0.85 }
        
        // Zen Mode: Slow growth over session + subtle pulse
        if engine.currentPattern.isTimerOnly == true {
             let growth = 0.5 + (0.4 * CGFloat(engine.cycleProgress)) // Grows 0.5 -> 0.9
             let pulse = 0.02 * sin(Date().timeIntervalSince1970 * 1.0) // Slow pulse
             return growth + pulse
        }
        
        let t = engine.phaseProgress // 0.0 to 1.0
        let phaseName = engine.currentPattern.phases[engine.currentPhaseIndex]
        
        switch phaseName {
        case "Inhale":
            // Web: scale = 0.35 + (0.65 * easeInOut(t))
            return 0.35 + (0.65 * easeInOut(t))
            
        case "Exhale":
            // Web: scale = 1.0 - (0.65 * easeInOut(t))
            return 1.0 - (0.65 * easeInOut(t))
            
        case "Hold":
            // Web determines "Full" or "Empty" by checking the PREVIOUS phase.
            // If previous was Inhale -> Hold Full. If previous was Exhale -> Hold Empty.
            let prevPhaseIndex = (engine.currentPhaseIndex - 1 + engine.currentPattern.phases.count) % engine.currentPattern.phases.count
            let prevPhaseName = engine.currentPattern.phases[prevPhaseIndex]
            
            if prevPhaseName == "Inhale" {
                // Hold Full: Very subtle pulse at scale 1.0
                // Web: scale = 1.0 + (0.02 * sin(elapsed * 2.5))
                // Using phaseProgress (0-1) over phase duration to approximate elapsed * 2.5
                let elapsed = t * engine.currentPhaseDuration // Convert progress back to seconds
                return 1.0 + (0.02 * sin(elapsed * 2.5))
            } else {
                // Hold Empty: Very subtle pulse at scale 0.35
                // Web: scale = 0.35 + (0.01 * sin(elapsed * 2.5))
                let elapsed = t * engine.currentPhaseDuration
                return 0.35 + (0.01 * sin(elapsed * 2.5))
            }
            
        default:
            return 0.85
        }
    }
    
    // MARK: - Easing Function (Exact Web App Port)
    
    /// CSS cubic-bezier easeInOut equivalent.
    /// Web: `t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2`
    func easeInOut(_ t: Double) -> Double {
        return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
    }
}
