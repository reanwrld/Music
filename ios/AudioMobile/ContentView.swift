import SwiftUI

struct ContentView: View {
    var body: some View {
        WebView(urlString: AppConfig.defaultServerURL)
            .ignoresSafeArea()
            .background(Color.black)
    }
}
