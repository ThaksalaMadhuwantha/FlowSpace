/* global chrome */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Custom storage adapter using Chrome local storage so login persists across sessions
const chromeStorageAdapter = {
  getItem: (key) => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([key], (result) => resolve(result[key] || null))
      } else {
        resolve(localStorage.getItem(key))
      }
    })
  },
  setItem: (key, value) => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [key]: value }, () => resolve())
      } else {
        localStorage.setItem(key, value)
        resolve()
      }
    })
  },
  removeItem: (key) => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.remove([key], () => resolve())
      } else {
        localStorage.removeItem(key)
        resolve()
      }
    })
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
})