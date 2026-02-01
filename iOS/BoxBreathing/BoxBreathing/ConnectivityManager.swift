import Foundation
import WatchConnectivity
import Combine

class ConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = ConnectivityManager()
    
    @Published var isReachable = false
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }
    
    // MARK: - Sender (iOS -> Watch)
    
    func sendSettings(patternId: String, duration: Double, isZenMode: Bool, isHapticsEnabled: Bool) {
        guard WCSession.default.activationState == .activated else { return }
        
        let context: [String: Any] = [
            "savedPatternId": patternId,
            "savedDuration": duration,
            "savedZenMode": isZenMode,
            "savedHaptics": isHapticsEnabled,
            "timestamp": Date().timeIntervalSince1970
        ]
        
        do {
            try WCSession.default.updateApplicationContext(context)
            print("Connectivity: Sent context: \(context)")
        } catch {
            print("Connectivity: Error sending context: \(error)")
        }
    }
    
    // MARK: - WCSessionDelegate
    
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    // iOS Specific Stubs
    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
    #endif
    
    // MARK: - Receiver (Watch -> Handle Updates)
    
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        DispatchQueue.main.async {
            print("Connectivity: Received context: \(applicationContext)")
            self.applySettings(applicationContext)
        }
    }
    
    private func applySettings(_ context: [String: Any]) {
        let defaults = UserDefaults.standard
        
        if let patternId = context["savedPatternId"] as? String {
            defaults.set(patternId, forKey: "savedPatternId")
        }
        if let duration = context["savedDuration"] as? Double {
            defaults.set(duration, forKey: "savedDuration")
        }
        if let isZenMode = context["savedZenMode"] as? Bool {
            defaults.set(isZenMode, forKey: "savedZenMode")
        }
        if let haptics = context["savedHaptics"] as? Bool {
            defaults.set(haptics, forKey: "savedHaptics")
        }
        
        // Notify Engine to reload
        NotificationCenter.default.post(name: NSNotification.Name("SettingsChangedFromWatch"), object: nil)
    }
}
