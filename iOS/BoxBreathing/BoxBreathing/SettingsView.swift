import SwiftUI

struct SettingsView: View {
    @ObservedObject var engine: BreathEngine
    @Environment(\.presentationMode) var presentationMode
    @State private var showGuide = false // Controls guide sheet
    
    // Custom Colors
    let bgDark = Color(red: 18/255, green: 22/255, blue: 27/255) // #12161b
    let cardColor = Color(red: 28/255, green: 34/255, blue: 41/255) // #1c2229
    let accentBlue = Color(red: 100/255, green: 180/255, blue: 220/255)
    
    var body: some View {
        NavigationView {
            ZStack {
                bgDark.ignoresSafeArea()
                
                VStack(spacing: 20) {
                    // Header
                    HStack {
                        Text(NSLocalizedString("Settings", comment: "Settings Title")) // Key "Settings"
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Spacer()
                        Button(action: { presentationMode.wrappedValue.dismiss() }) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 26))
                                .foregroundColor(.white.opacity(0.3))
                        }
                    }
                    .padding(.top, 20)
                    .padding(.horizontal, 24)
                    
                    ScrollView {
                        VStack(spacing: 16) {
                            
                            // 0. Session Statistics Card (if any sessions completed)
                            if engine.lastSessionMinutes > 0 || engine.todaySessionCount > 0 {
                                HStack(spacing: 20) {
                                    // Last Session
                                    VStack(spacing: 4) {
                                        Image(systemName: "clock")
                                            .font(.system(size: 18))
                                            .foregroundColor(accentBlue)
                                        Text("\(engine.lastSessionMinutes) min")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.9))
                                        Text(NSLocalizedString("Last Session", comment: "Last Session Label")) // Key "Last Session"
                                            .font(.caption2)
                                            .foregroundColor(.white.opacity(0.4))
                                    }
                                    .frame(maxWidth: .infinity)
                                    
                                    Divider()
                                        .frame(height: 40)
                                        .background(Color.white.opacity(0.1))
                                    
                                    // Today's Sessions
                                    VStack(spacing: 4) {
                                        Image(systemName: "flame")
                                            .font(.system(size: 18))
                                            .foregroundColor(accentBlue)
                                        Text("\(engine.todaySessionCount)")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.9))
                                        Text(NSLocalizedString("Today", comment: "Today Label")) // Key "Today"
                                            .font(.caption2)
                                            .foregroundColor(.white.opacity(0.4))
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .padding(16)
                                .background(cardColor)
                                .cornerRadius(16)
                            }
                            
                            // 1. Pattern Grid with Icons and Animation
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Label(NSLocalizedString("Breathing Pattern", comment: "Section Header"), systemImage: "lungs.fill") // Key
                                        .font(.headline)
                                        .foregroundColor(.white.opacity(0.9))
                                    
                                    Spacer()
                                    
                                    // Info Button for Guide
                                    Button(action: { showGuide = true }) {
                                        Image(systemName: "info.circle")
                                            .font(.system(size: 20))
                                            .foregroundColor(.white.opacity(0.4))
                                    }
                                }
                                
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                                    ForEach(BreathingPattern.allPresets) { pattern in
                                        PatternButton(
                                            pattern: pattern,
                                            // Fix: Explicitly check id because Equatable might be strict
                                            isSelected: engine.currentPattern.id == pattern.id,
                                            accentColor: accentBlue
                                        ) {
                                            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                                                engine.setPattern(pattern)
                                            }
                                        }
                                        .id(pattern.id) // Help SwiftUI identify views
                                    }
                                }
                                

                            }
                            .padding(20)
                            .background(cardColor)
                            .cornerRadius(20)

                            // 2. Duration Slider Card
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Label(NSLocalizedString("Phase Duration", comment: "Section Header"), systemImage: "timer") // Key
                                        .font(.headline)
                                        .foregroundColor(.white.opacity(0.9))
                                    Spacer()
                                    Text(String(format: "%.1f s", engine.duration))
                                        .font(.system(size: 18, weight: .bold, design: .monospaced))
                                        .foregroundColor(accentBlue)
                                }
                                
                                // Slider instead of +/- buttons
                                Slider(value: $engine.duration, in: 3.0...15.0, step: 0.5)
                                    .tint(accentBlue)
                                
                                Text(NSLocalizedString("Speed of Inhale-Hold-Exhale", comment: "Duration Description")) // Key
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.4))
                                    .multilineTextAlignment(.center)
                            }
                            .padding(20)
                            .background(cardColor)
                            .cornerRadius(20)

                            // 3. Toggle Settings
                            VStack(spacing: 0) {
                                ToggleRowCompact(title: NSLocalizedString("Focus Mode", comment: ""), icon: "eye.slash.fill", isOn: $engine.isZenMode, accentColor: accentBlue)
                                Divider().background(Color.white.opacity(0.05)).padding(.leading, 36)
                                ToggleRowCompact(title: NSLocalizedString("Haptics", comment: ""), icon: "iphone.radiowaves.left.and.right", isOn: $engine.isHapticsEnabled, accentColor: accentBlue)
                                Divider().background(Color.white.opacity(0.05)).padding(.leading, 36)
                                ToggleRowCompact(title: NSLocalizedString("Sound", comment: ""), icon: "speaker.wave.2", isOn: Binding(
                                    get: { !engine.isMuted },
                                    set: { engine.isMuted = !$0 }
                                ), accentColor: accentBlue)
                            }
                            .padding(20)
                            .background(cardColor)
                            .cornerRadius(20)
                            

                        }
                        .padding(.horizontal, 20)
                    }
                    
                    Text(NSLocalizedString("LUNG iOS • © 2026", comment: "Footer")) // Key
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.2))
                        .padding(.bottom, 10)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showGuide) {
                GuideView()
            }
        }
    }
}

// MARK: - Pattern Button with Icon and Animation

struct PatternButton: View {
    let pattern: BreathingPattern
    let isSelected: Bool
    let accentColor: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                // SF Symbol Icon
                Image(systemName: pattern.icon)
                    .font(.system(size: 20, weight: .light))
                    .foregroundColor(isSelected ? accentColor : .white.opacity(0.5))
                
                Text(pattern.name)
                    .font(.system(size: 14, weight: .semibold))
                
                Text(pattern.ratiosString)
                    .font(.caption2)
                    .opacity(0.6)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                isSelected
                ? accentColor.opacity(0.2)
                : Color.black.opacity(0.2)
            )
            .foregroundColor(
                isSelected
                ? accentColor
                : .white.opacity(0.6)
            )
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? accentColor.opacity(0.5) : Color.clear, lineWidth: 1)
            )
            .scaleEffect(isSelected ? 1.02 : 1.0) // Subtle scale-up when selected
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Toggle Row with Accent Color

struct ToggleRowCompact: View {
    let title: String
    let icon: String
    @Binding var isOn: Bool
    var accentColor: Color = Color.blue
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.white.opacity(0.5))
                .frame(width: 24)
            Text(title)
                .font(.system(size: 16))
                .foregroundColor(.white.opacity(0.9))
            Spacer()
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(accentColor)
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Extension for Ratios Display

extension BreathingPattern {
    var ratiosString: String {
        ratios.map { String(format: "%.0f", $0) }.joined(separator: "-")
    }
}
