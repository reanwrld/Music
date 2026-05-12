import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let urlString: String

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = .black
        webView.isOpaque = false
        loadInitialPage(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard webView.url == nil else { return }
        loadInitialPage(in: webView)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    private func loadInitialPage(in webView: WKWebView) {
        guard let url = URL(string: urlString) else { return }
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showErrorPage(in: webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showErrorPage(in: webView)
        }

        private func showErrorPage(in webView: WKWebView) {
            let html = """
            <!doctype html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body {
                        margin: 0;
                        min-height: 100vh;
                        display: grid;
                        place-items: center;
                        background: #0f0f10;
                        color: #f5f5f7;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    }
                    main {
                        width: min(84vw, 360px);
                        text-align: center;
                    }
                    h1 {
                        font-size: 24px;
                        margin: 0 0 10px;
                    }
                    p {
                        color: #a1a1a6;
                        font-size: 15px;
                        line-height: 1.45;
                    }
                </style>
            </head>
            <body>
                <main>
                    <h1>Cannot connect</h1>
                    <p>Start the Music server on your Mac, keep your iPhone on the same Wi-Fi, then relaunch the app.</p>
                </main>
            </body>
            </html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
}
