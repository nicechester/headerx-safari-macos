//
//  AppDelegate.swift
//  macOS (App)
//
//  Created by Kim, Chester on 7/13/26.
//

import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Override point for customization after application launch.
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // Keep the host app alive so Safari can reach the web extension after the
        // setup window is dismissed (especially important for Xcode/dev builds).
        return false
    }

}
