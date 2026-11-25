/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  // Open the side panel automatically when the extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  // Create the right-click context menu option for selected text
  chrome.contextMenus.create({
    id: 'add-to-flowspace',
    title: 'Add "%s" to FlowSpace',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'add-to-flowspace' && info.selectionText) {
    // Save highlighted text to local storage and open the side panel
    chrome.storage.local.set({ pendingQuickText: info.selectionText }, () => {
      if (tab?.windowId) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
      }
    });
  }
});