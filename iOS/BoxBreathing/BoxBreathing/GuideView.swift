import SwiftUI

struct GuideView: View {
    @Environment(\.presentationMode) var presentationMode
    
    // Custom Colors
    let bgDark = Color(red: 18/255, green: 22/255, blue: 27/255) // #12161b
    let cardColor = Color(red: 28/255, green: 34/255, blue: 41/255) // #1c2229
    let accentBlue = Color(red: 100/255, green: 180/255, blue: 220/255)
    
    var body: some View {
        NavigationView {
            ZStack {
                bgDark.ignoresSafeArea()
                
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        
                        // Section 1: Controls
                        VStack(alignment: .leading, spacing: 16) {
                            Text(NSLocalizedString("Controls", comment: "Section Header"))
                                .font(.title3)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                            
                            VStack(alignment: .leading, spacing: 12) {
                                ControlRow(icon: "arrow.left.and.right.circle.fill", title: NSLocalizedString("Swipe Timer", comment: "Control Title"), description: NSLocalizedString("Quickly adjust the session duration.", comment: "Control Description"))
                                ControlRow(icon: "gearshape.fill", title: NSLocalizedString("Focus Mode", comment: "Control Title"), description: NSLocalizedString("Long press the settings gear to toggle UI visibility.", comment: "Control Description"))
                                ControlRow(icon: "hand.tap.fill", title: NSLocalizedString("Start / Stop", comment: "Control Title"), description: NSLocalizedString("Tap anywhere on the screen.", comment: "Control Description"))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(20)
                        .background(cardColor)
                        .cornerRadius(20)
                        
                        // Section 2: Patterns
                        VStack(alignment: .leading, spacing: 16) {
                            Text(NSLocalizedString("Breathing Patterns", comment: "Section Header"))
                                .font(.title3)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                            
                            VStack(alignment: .leading, spacing: 20) {
                                PatternDescription(
                                    title: NSLocalizedString("Box Breathing (1-1-1-1)", comment: "Pattern Title"),
                                    description: NSLocalizedString("Inhale, hold, exhale, hold – all the same length. The classic for instant clarity and nerves of steel. Perfect when you're feeling like a jittery squirrel on caffeine.", comment: "Pattern Description")
                                )
                                
                                PatternDescription(
                                    title: NSLocalizedString("Calm (4-2-4)", comment: "Pattern Title"),
                                    description: NSLocalizedString("4 seconds in, 2 hold, 4 out. Gentle calm-down mode when you need to chill fast without breaking a sweat.", comment: "Pattern Description")
                                )
                                
                                PatternDescription(
                                    title: NSLocalizedString("Relax (4-7-8)", comment: "Pattern Title"),
                                    description: NSLocalizedString("4 in, 7 hold, 8 out. Dr. Weil's famous sleep hack. Works so well, folks often nod off before they even hit the 7-second count.", comment: "Pattern Description")
                                )
                                
                                PatternDescription(
                                    title: NSLocalizedString("Simple (1-1)", comment: "Pattern Title"),
                                    description: NSLocalizedString("Even in and out breaths. The no-brainer for on-the-go or when your mind's doing loop-de-loops.", comment: "Pattern Description")
                                )
                                
                                PatternDescription(
                                    title: NSLocalizedString("Unwind / Deep Calm (1-2)", comment: "Pattern Title"),
                                    description: NSLocalizedString("Inhale for 1 part, exhale for 2. The quickest way to kick your chill mode into gear. Double exhale = double the relaxation vibes. Great for just \"blowing away\" that stress.", comment: "Pattern Description")
                                )
                                
                                PatternDescription(
                                    title: NSLocalizedString("Meditation", comment: "Pattern Title"),
                                    description: NSLocalizedString("A no-fuss timer for zen sessions from 1 to 60 minutes, ending with a gentle \"time's up!\" nudge. Say goodbye to those sneaky \"just five more minutes\" traps.", comment: "Pattern Description")
                                )
                            }
                        }
                        .padding(20)
                        .background(cardColor)
                        .cornerRadius(20)
                        
                        // Footer
                        Text(NSLocalizedString("LUNG iOS • Guide", comment: "Footer"))
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.3))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 10)
                            .padding(.bottom, 30)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Guide")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { presentationMode.wrappedValue.dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.white.opacity(0.3))
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

// Helper Views
struct ControlRow: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(Color(red: 100/255, green: 180/255, blue: 220/255))
                .frame(width: 24)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                Text(description)
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct PatternDescription: View {
    let title: String
    let description: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(red: 100/255, green: 180/255, blue: 220/255)) // Accent Blue
            
            Text(description)
                .font(.system(size: 14))
                .foregroundColor(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(4)
        }
    }
}

struct GuideView_Previews: PreviewProvider {
    static var previews: some View {
        GuideView()
    }
}
