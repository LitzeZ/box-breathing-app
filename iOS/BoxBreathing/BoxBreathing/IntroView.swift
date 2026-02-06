import SwiftUI

struct IntroView: View {
    @ObservedObject var engine: BreathEngine
    @Binding var isPresented: Bool
    
    @State private var currentPage = 0
    @State private var showChevron = false
    
    // Custom Colors
    let accentBlue = Color(red: 100/255, green: 180/255, blue: 220/255)
    
    // Filter out "Meditation" (Zen) and "Simple" as requested
    var patterns: [BreathingPattern] {
        BreathingPattern.allPresets.filter { $0.id != "zen" && $0.id != "simple" }
    }
    
    var body: some View {
        ZStack {
            // Transparent Material Background
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()
            
            VStack {
                // Page Indicator
                HStack(spacing: 8) {
                    ForEach(0..<2) { index in
                        Circle()
                            .fill(currentPage == index ? Color.white : Color.white.opacity(0.2))
                            .frame(width: 8, height: 8)
                    }
                }
                .padding(.top, 20)
                
                TabView(selection: $currentPage) {
                    
                    // PAGE 1: Pattern Selection (Merged with Info)
                    VStack(spacing: 20) {
                        Text(NSLocalizedString("Choose Pattern", value: "Choose Pattern", comment: "Onboarding Header"))
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.top, 20)
                        
                        Text(NSLocalizedString("Select a breathing style to get started.", value: "Select a breathing style to get started.", comment: "Onboarding Subtitle"))
                            .font(.body)
                            .foregroundColor(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        
                        ScrollView {
                            VStack(spacing: 12) {
                                ForEach(patterns) { pattern in
                                    IntroPatternRow(
                                        pattern: pattern,
                                        isSelected: engine.currentPattern.id == pattern.id,
                                        accentColor: accentBlue
                                    ) {
                                        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                                            engine.setPattern(pattern)
                                        }
                                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    }
                                }
                            }
                            .padding(20)
                        }
                        
                        // Swipe Prompt
                        VStack {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white.opacity(0.5))
                                .offset(x: showChevron ? 5 : -5)
                                .onAppear {
                                    withAnimation(Animation.easeInOut(duration: 1.0).repeatForever()) {
                                        showChevron.toggle()
                                    }
                                }
                            
                            Text(NSLocalizedString("Swipe", value: "Swipe", comment: "Onboarding action"))
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.5))
                                .padding(.top, 4)
                        }
                        .padding(.bottom, 30)
                    }
                    .tag(0)
                    
                    // PAGE 2: Controls & Start
                    VStack(spacing: 20) {
                        Text(NSLocalizedString("Controls", value: "Controls", comment: "Onboarding Header"))
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.top, 20)
                        
                        ScrollView {
                            VStack(alignment: .leading, spacing: 20) {
                                IntroControlRow(icon: "arrow.left.and.right.circle.fill", title: NSLocalizedString("Swipe Timer", comment: ""), description: NSLocalizedString("Quickly adjust the session duration.", comment: ""))
                                IntroControlRow(icon: "gearshape.fill", title: NSLocalizedString("Focus Mode", comment: ""), description: NSLocalizedString("Long press the settings gear to toggle UI visibility.", comment: ""))
                                IntroControlRow(icon: "hand.tap.fill", title: NSLocalizedString("Start / Stop", comment: ""), description: NSLocalizedString("Tap anywhere on the screen.", comment: ""))
                            }
                            .padding(20)
                        }
                        
                        Spacer()
                        
                        Button(action: {
                            withAnimation {
                                isPresented = false
                            }
                            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                        }) {
                            Text(NSLocalizedString("Begin Journey", comment: "Onboarding Button"))
                                .font(.headline)
                                .foregroundColor(.black)
                                .frame(maxWidth: .infinity)
                                .frame(height: 56)
                                .background(Color.white)
                                .cornerRadius(28)
                                .shadow(radius: 10)
                        }
                        .padding(.horizontal, 40)
                        .padding(.bottom, 40)
                    }
                    .tag(1)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
        }
    }
}

// MARK: - Helper Components

struct IntroPatternRow: View {
    let pattern: BreathingPattern
    let isSelected: Bool
    let accentColor: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                // Icon
                ZStack {
                    Circle()
                        .fill(isSelected ? accentColor.opacity(0.2) : Color.white.opacity(0.1))
                        .frame(width: 50, height: 50)
                    
                    Image(systemName: pattern.icon)
                        .font(.system(size: 24))
                        .foregroundColor(isSelected ? accentColor : .white)
                }
                
                // Text Content
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(pattern.name)
                            .font(.headline)
                            .foregroundColor(.white)
                        
                        Spacer()
                        
                        // Ratios Badge
                        Text(pattern.ratiosString)
                            .font(.caption2)
                            .fontWeight(.bold)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.1))
                            .cornerRadius(8)
                            .foregroundColor(.white.opacity(0.8))
                    }
                    
                    Text(pattern.description)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.7))
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true) // Allow wrapping
                }
            }
            .padding(16)
            .background(
                isSelected
                ? accentColor.opacity(0.1)
                : Color.black.opacity(0.2)
            )
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? accentColor.opacity(0.5) : Color.white.opacity(0.05), lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct IntroControlRow: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(Color(red: 100/255, green: 180/255, blue: 220/255))
                .frame(width: 30)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundColor(.white.opacity(0.9))
                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.2))
        .cornerRadius(12)
    }
}
