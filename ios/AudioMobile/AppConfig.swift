import Foundation

enum AppConfig {
    // Local testing: use your Mac's Wi-Fi IP.
    // Sideload/TestFlight away from home: replace this with a hosted HTTPS backend URL.
    static let defaultServerURL = "http://192.168.4.51:8001"
}
