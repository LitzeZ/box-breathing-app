//
//  ContentView.swift
//  BoxBreathingApp Watch App
//
//  Created by CIC on 28.01.2026.
//

import SwiftUI

struct ContentView: View {
    @StateObject var engine = BreathEngine()
    @State private var crownValue: Double = 5.0 // Default 5 minutes
    
    // Valid minute values matching iOS (1, 3, 5, 10...)
    private let validMinutes = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
    
    var body: some View {
        ZStack {
            // Background
            Color.black.edgesIgnoringSafeArea(.all)
            
            // 1. Center: Progress Ring & Breathing Circle
            ZStack {
                // Track
                Circle()
                    .stroke(Color.white.opacity(0.15), lineWidth: 6)
                
                // Fill
                Circle()
                    .trim(from: 0, to: engine.cycleProgress)
                    .stroke(
                        Color.white.opacity(0.5),
                        style: StrokeStyle(lineWidth: 6, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90 + (engine.cycleResetTrigger ? 8 : 0)))
                    .animation(.interpolatingSpring(stiffness: 180, damping: 12), value: engine.cycleProgress)
                    .animation(.interpolatingSpring(stiffness: 300, damping: 8), value: engine.cycleResetTrigger)
            }
            .frame(width: 124, height: 124) // Reduced slightly for better visual separation
            
            // Glow Layer (matches iOS)
            if engine.isRunning {
                Circle()
                    .fill(Color.white.opacity(0.25))
                    .frame(width: 86, height: 86)
                    .blur(radius: 15)
                    .scaleEffect(scaleFactor())
            }
            
            // Main Breathing Circle
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [Color.white.opacity(0.9), Color.white.opacity(0.1)]),
                        center: UnitPoint(x: 0.3, y: 0.3),
                        startRadius: 5,
                        endRadius: 70
                    )
                )
                .frame(width: 86, height: 86)
                .scaleEffect(scaleFactor())
                .shadow(color: Color.white.opacity(0.15), radius: 15, x: 0, y: 0)
            
            // Duration Display (Only when NOT running)
            if !engine.isRunning {
                VStack {
                    Spacer()
                    Text("\(engine.sessionMinutes) min")
                        .font(.system(size: 16, weight: .ultraLight, design: .rounded))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.bottom, 5) // Lower, but safe from bezel
                }
                .edgesIgnoringSafeArea(.bottom)
                .transition(.opacity)
            }
            
            // Invisible Tap Area for Interaction
            Color.white.opacity(0.001)
                .onTapGesture {
                    withAnimation {
                        engine.toggle()
                    }
                }
        }
        .focusable()
        .digitalCrownRotation(
            $crownValue,
            from: 1, through: 60, by: 1,
            sensitivity: .low
        )
        .onChange(of: crownValue) { _, newValue in
            // Snap to valid minute values
            let snapped = snapToValid(Int(newValue))
            if engine.sessionMinutes != snapped && !engine.isRunning {
                engine.sessionMinutes = snapped
                engine.remainingSessionSeconds = snapped * 60
                #if os(watchOS)
                WKInterfaceDevice.current().play(.click)
                #endif
            }
        }
        .onAppear {
            crownValue = Double(engine.sessionMinutes)
            if engine.isRunning { engine.stop() }
        }
    }
    
    // Helper for Timer String "14:59"
    private func timeString(from seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%02d:%02d", m, s)
    }
    
    // Tint Color
    let accentBlue = Color(red: 100/255, green: 180/255, blue: 220/255)
    
    /// Snaps to nearest valid minute value
    private func snapToValid(_ value: Int) -> Int {
        return validMinutes.min(by: { abs($0 - value) < abs($1 - value) }) ?? value
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
        
        // Safety check for index
        guard engine.currentPhaseIndex >= 0 && engine.currentPhaseIndex < engine.currentPattern.phases.count else { return 0.85 }
        
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
                // Using phaseProgress (0-1) over phase duration to approximate elapsed * 2.5
                let elapsed = t * engine.currentPhaseDuration // Convert progress back to seconds
                return 1.0 + (0.02 * sin(elapsed * 2.5))
            } else {
                // Hold Empty: Very subtle pulse at scale 0.35
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
