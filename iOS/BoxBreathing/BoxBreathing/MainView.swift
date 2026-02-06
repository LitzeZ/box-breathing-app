import SwiftUI

struct MainView: View {
    @StateObject var engine = BreathEngine() // Changed from private to internal access
    @State private var showSettings = false
    
    // Gradient matching style.css (Radial Gradient)
    let backgroundGradient = RadialGradient(
        gradient: Gradient(colors: [
            Color(red: 26/255, green: 58/255, blue: 74/255), // #1a3a4a
            Color(red: 13/255, green: 33/255, blue: 41/255), // #0d2129
            Color(red: 10/255, green: 21/255, blue: 26/255)  // #0a151a
        ]),
        center: .center,
        startRadius: 5,
        endRadius: 500
    )
    
    var body: some View {
        ZStack {
            // Background
            backgroundGradient
                .ignoresSafeArea()
            
            VStack {
                // Header Layout
                Spacer()
                
                Text(engine.isRunning ? engine.phaseName.uppercased() : (engine.currentPattern.isTimerOnly == true ? engine.currentPattern.name.uppercased() : "\(engine.currentPattern.name.uppercased())\(NSLocalizedString("BREATHING", comment: "Title Suffix"))"))
                    .font(.system(size: 24, weight: .light, design: .rounded))
                    .tracking(4) // Letter Spacing
                    .foregroundColor(.white.opacity(0.9))
                    .opacity(engine.isZenMode && engine.isRunning ? engine.zenModeOpacity : 1.0) // Zen Mode: Smooth Fade
                    .animation(.easeInOut, value: engine.isRunning)

                    .contentTransition(.numericText())
                    .animation(.easeInOut, value: engine.phaseName)
                
                Spacer()
                
                // Visualization
                // Visualization
                ZStack {
                    // Progress Ring
                    ZStack {
                        // Background Ring
                        Circle()
                            .stroke(Color.white.opacity(0.1), lineWidth: 4)
                        
                        // Progress Ring with swing-back effect
                        Circle()
                            .trim(from: 0, to: engine.cycleProgress)
                            .stroke(Color.white.opacity(0.3), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                            // Swing wobble: kicks out 8° on reset, springs back
                            .rotationEffect(.degrees(-90 + (engine.cycleResetTrigger ? 8 : 0)))
                            // Elastic snap for trim
                            .animation(.interpolatingSpring(stiffness: 180, damping: 12), value: engine.cycleProgress)
                            // Bouncy wobble for rotation
                            .animation(.interpolatingSpring(stiffness: 300, damping: 8), value: engine.cycleResetTrigger)
                    }
                    .frame(width: 210, height: 210)
                    
                    // Breathing Circle (Scales independently)
                    CircleView(engine: engine)
                }
                .frame(width: 220, height: 220)
                
                Spacer()
                
                // Controls
                VStack(spacing: 30) {
                // Timer Control
                    TimerControl(
                        minutes: Binding(
                            get: { engine.sessionMinutes },
                            set: { newValue in
                                engine.sessionMinutes = newValue
                                if !engine.isRunning {
                                    engine.remainingSessionSeconds = newValue * 60
                                }
                            }
                        ),
                        remainingSeconds: engine.remainingSessionSeconds,
                        isRunning: engine.isRunning
                    )
                    .opacity(engine.isZenMode && engine.isRunning ? engine.zenModeOpacity : 1.0)

                    
                    // Main Action Button
                    Button(action: {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        withAnimation {
                            engine.toggle()
                        }
                    }) {
                        Text(engine.isAudioReady ? (engine.isRunning ? NSLocalizedString("STOP", comment: "") : NSLocalizedString("START", comment: "")) : NSLocalizedString("LOADING...", comment: ""))
                            .font(.system(size: 18, weight: .medium, design: .default))
                            .tracking(2)
                            .foregroundColor(.white)
                            .frame(width: 200, height: 60)
                            .background(
                                engine.isRunning 
                                ? Color(red: 142/255, green: 68/255, blue: 68/255).opacity(0.8) // Reddish Stop
                                : Color.white.opacity(engine.isAudioReady ? 0.1 : 0.05)
                            )
                            .cornerRadius(30)
                            .overlay(
                                RoundedRectangle(cornerRadius: 30)
                                    .stroke(Color.white.opacity(0.15), lineWidth: 1)
                            )
                            .shadow(color: Color.black.opacity(0.2), radius: 10, x: 0, y: 4)
                    }
                    .disabled(!engine.isAudioReady)
                    .opacity(engine.isZenMode && engine.isRunning ? engine.zenModeOpacity : 1.0)

                    
                    // Settings Button (Tap for Settings, Long Press for Focus Mode)
                    Image(systemName: "gearshape")
                        .font(.system(size: 22, weight: .light))
                        .foregroundColor(.white.opacity(0.6))
                        .frame(width: 44, height: 44)
                        .background(Color.white.opacity(0.05))
                        .clipShape(Circle())
                        .contentShape(Circle()) // Increases hit area reliability
                        .onTapGesture {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            showSettings.toggle()
                        }
                        .onLongPressGesture(minimumDuration: 0.5) {
                            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                            withAnimation {
                                engine.isZenMode.toggle()
                            }
                        }
                        .opacity(engine.isZenMode && engine.isRunning ? engine.zenModeOpacity : 1.0)

                }
                
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
        // Hide Status Bar (Clock/Battery) in Focus Mode (Zen Mode) when running
        .statusBar(hidden: engine.isZenMode && engine.isRunning)
        .sheet(isPresented: $showSettings) { SettingsView(engine: engine) }
        .onTapGesture {
            // Zen Mode Running Logic
            if engine.isZenMode && engine.isRunning {
                if engine.zenModeOpacity < 0.5 {
                    // UI is hidden, reveal it
                    withAnimation(.easeInOut(duration: 0.5)) {
                        engine.resetZenModeIdle()
                    }
                } else {
                    // UI is visible, stop session
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    withAnimation { engine.toggle() }
                }
            } else {
                // Standard Mode (or Zen Idle): Toggle Start/Stop
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                withAnimation { engine.toggle() }
            }
        }
        // Intro / Onboarding Overlay
        .overlay(
            Group {
                if showIntro {
                    IntroView(engine: engine, isPresented: $showIntro)
                        .transition(.opacity)
                        // When intro is dismissed, mark as launched
                        .onDisappear {
                            hasLaunchedBefore = true
                        }
                }
            }
            .animation(.easeInOut, value: showIntro)
        )
        .onAppear {
            // Check first launch
            if !hasLaunchedBefore {
                // Small delay to let view settle/layout before showing overlay if needed, 
                // but direct assignment usually works in onAppear for overlays
                showIntro = true
            }
        }
    }
    
    // Onboarding State
    @AppStorage("hasLaunchedBefore") private var hasLaunchedBefore: Bool = false
    @State private var showIntro = false
    
    func timeString(from totalSeconds: Int) -> String {
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// Preview to verify layout without running logic
struct MainView_Previews: PreviewProvider {
    static var previews: some View {
        MainView()
    }
}

// MARK: - Timer Control

struct TimerControl: View {
    @Binding var minutes: Int
    var remainingSeconds: Int = 0
    var isRunning: Bool = false
    @State private var dragOffset: CGFloat = 0
    
    // Valid minute values: 1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60
    private let validMinutes = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
    
    // Computed property for display text
    private var displayText: String {
        if isRunning {
            // Live countdown: MM:SS
            let m = remainingSeconds / 60
            let s = remainingSeconds % 60
            return String(format: "%d:%02d", m, s)
        } else {
            // Set duration: M:00
            return String(format: "%d:%02d", minutes, 0)
        }
    }
    
    var body: some View {
        HStack(spacing: 0) {
            // Left Arrow Button (Inside)
            Button(action: decreaseTime) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(isRunning ? 0.2 : 0.5))
                    .frame(width: 44, height: 50)
                    .contentShape(Rectangle())
            }
            .disabled(isRunning)
            .accessibilityLabel("Decrease Time")
            
            Spacer()
            
            // Time Display
            Text(displayText)
                .font(.system(size: 20, weight: .light, design: .monospaced))
                .foregroundColor(.white.opacity(0.9))
                .contentTransition(.numericText())
                .animation(.easeInOut(duration: 0.15), value: displayText)
                .offset(x: isRunning ? 0 : dragOffset * 0.3)
            
            Spacer()
            
            // Right Arrow Button (Inside)
            Button(action: increaseTime) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(isRunning ? 0.2 : 0.5))
                    .frame(width: 44, height: 50)
                    .contentShape(Rectangle())
            }
            .disabled(isRunning)
            .accessibilityLabel("Increase Time")
        }
        .padding(.horizontal, 4)
        .frame(height: 50)
        // Fixed width to match Start Button (approx 160-180 based on visual)
        .frame(minWidth: 160, maxWidth: 180) 
        .background(
            Capsule()
                .fill(Color.black.opacity(0.3))
        )
        .contentShape(Capsule())
        .gesture(
            isRunning ? nil : DragGesture()
                .onChanged { value in
                    dragOffset = value.translation.width
                }
                .onEnded { value in
                    if value.translation.width < -30 {
                        increaseTime()
                    } else if value.translation.width > 30 {
                        decreaseTime()
                    }
                    withAnimation(.interpolatingSpring(stiffness: 300, damping: 20)) {
                        dragOffset = 0
                    }
                }
        )
    }
    
    private func decreaseTime() {
        guard !isRunning else { return }
        guard let currentIndex = validMinutes.firstIndex(of: snapToValid(minutes)),
              currentIndex > 0 else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        minutes = validMinutes[currentIndex - 1]
    }
    
    private func increaseTime() {
        guard !isRunning else { return }
        guard let currentIndex = validMinutes.firstIndex(of: snapToValid(minutes)),
              currentIndex < validMinutes.count - 1 else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        minutes = validMinutes[currentIndex + 1]
    }
    
    private func snapToValid(_ value: Int) -> Int {
        return validMinutes.min(by: { abs($0 - value) < abs($1 - value) }) ?? value
    }
}
