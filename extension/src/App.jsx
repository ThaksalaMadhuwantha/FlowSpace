/* global chrome */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import {
  Plus, LogOut, Trash2, Building2, Bell, AlertTriangle,
  DollarSign, Briefcase, ChevronLeft, ChevronRight, X, Search, Wallet
} from 'lucide-react'

const DEFAULT_CATEGORIES = [
  { name: 'CV Design', color: '#0A84FF' },
  { name: 'Flyer', color: '#32ADE6' },
  { name: 'FB Post', color: '#5E5CE6' },
  { name: 'Logo', color: '#FF9F0A' },
  { name: 'Service Letter', color: '#BF5AF2' },
]

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/25' },
  in_progress: { label: 'In Progress', color: 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/25' },
  review: { label: 'In Review', color: 'bg-[#BF5AF2]/15 text-[#BF5AF2] border-[#BF5AF2]/25' },
  revision: { label: 'Update Needed', color: 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/30' },
  done: { label: 'Completed', color: 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/25' },
}

const CLIENT_PAYMENT_CONFIG = {
  unpaid: { label: 'Unpaid', color: 'bg-white/[0.06] text-white/65 border-white/15' },
  half_paid: { label: 'Half Paid', color: 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30' },
  full_paid: { label: 'Full Paid', color: 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30' },
}

function getCategoryPrefix(catName) {
  if (!catName) return 'TASK'
  const lower = catName.trim().toLowerCase()
  if (lower.includes('service') || lower === 'sl') return 'SL'
  const firstWord = catName.trim().split(/\s+/)[0]
  return firstWord.length <= 3
    ? firstWord.toUpperCase()
    : firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
}

function getNextSequenceCode(prefix, existingCodes, countFallback) {
  const regex = new RegExp(`^${prefix}_(\\d+)`, 'i')
  let maxNum = 0
  existingCodes.forEach(code => {
    if (!code) return
    const match = code.trim().match(regex)
    if (match) {
      const num = parseInt(match[1], 10)
      if (!isNaN(num) && num > maxNum) maxNum = num
    }
  })
  const nextNum = Math.max(maxNum, countFallback) + 1
  return `${prefix}_${String(nextNum).padStart(2, '0')}`
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  // Core states
  const [profile, setProfile] = useState(null)
  const [allProfiles, setAllProfiles] = useState([])
  const [orders, setOrders] = useState([])
  const [categories, setCategories] = useState([])
  const [employees, setEmployees] = useState([])
  const [notifications, setNotifications] = useState([])

  // Workspace view mode: 'hub' | 'my_orders' | 'shared_orders'
  const [workspaceMode, setWorkspaceMode] = useState('hub')
  const [selectedCompanyOwnerId, setSelectedCompanyOwnerId] = useState('all')
  const [showNotifications, setShowNotifications] = useState(false)

  // Quick Add Order drawer toggle & form states
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [titleSuffix, setTitleSuffix] = useState('')
  const [clientName, setClientName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [price, setPrice] = useState('')
  const [clientPaymentStatus, setClientPaymentStatus] = useState('unpaid')
  const [employeeFee, setEmployeeFee] = useState('')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Revision modal state
  const [revisionModalOrder, setRevisionModalOrder] = useState(null)
  const [revisionNoteInput, setRevisionNoteInput] = useState('')

  const userId = session?.user?.id
  const userEmail = session?.user?.email

  // Data fetchers
  const fetchProfiles = useCallback(async () => {
    if (!userId || !userEmail) return
    const { data } = await supabase.from('profiles').select('*')
    if (data) {
      const mine = data.find(p => p.id === userId)
      if (!mine) {
        const defaultName = userEmail.split('@')[0] + ' Studio'
        const { data: created } = await supabase
          .from('profiles')
          .insert([{ id: userId, email: userEmail, company_name: defaultName }])
          .select()
          .single()
        if (created) {
          setProfile(created)
          setAllProfiles([...data, created])
          return
        }
      } else {
        setProfile(mine)
      }
      setAllProfiles(data)
    }
  }, [userId, userEmail])

  const fetchCategories = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('categories').select('*').order('created_at', { ascending: true })
    if (data) {
      const myCategories = data.filter(c => c.user_id === userId)
      if (myCategories.length === 0) {
        const toInsert = DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: userId }))
        const { data: seeded } = await supabase.from('categories').insert(toInsert).select()
        if (seeded) {
          setCategories([...data, ...seeded])
          setCategoryId(seeded[0]?.id || '')
        }
        return
      }
      setCategories(data)
      setCategoryId(prev => prev || myCategories[0]?.id || '')
    }
  }, [userId])

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').order('created_at', { ascending: true })
    if (data) setEmployees(data)
  }, [])

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (data) setOrders(data)
  }, [])

  const fetchNotifications = useCallback(async () => {
    if (!userEmail) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25)
    if (data) setNotifications(data)
  }, [userEmail])

  const fetchAllData = useCallback(async () => {
    await Promise.all([
      fetchProfiles(),
      fetchCategories(),
      fetchEmployees(),
      fetchOrders(),
      fetchNotifications(),
    ])
  }, [fetchProfiles, fetchCategories, fetchEmployees, fetchOrders, fetchNotifications])

  // Auth Session Check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Initial Load & Real-time Subscriptions
  useEffect(() => {
    if (!userId) return

    let isMounted = true
    const initLoad = async () => {
      if (isMounted) await fetchAllData()
    }
    initLoad()

    const channel = supabase
      .channel('flowspace-ext-ios-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, fetchEmployees)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchCategories)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchProfiles)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, fetchNotifications)
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [userId, fetchAllData, fetchOrders, fetchEmployees, fetchCategories, fetchProfiles, fetchNotifications])

  // Return to Workspace Hub and refresh whenever side panel is hidden/minimized or re-opened
  useEffect(() => {
    if (!userId) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setWorkspaceMode('hub')
        setShowNotifications(false)
      } else if (document.visibilityState === 'visible') {
        setWorkspaceMode('hub')
        fetchAllData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [userId, fetchAllData])

  // Chrome Extension Google OAuth Flow
  const handleGoogleLogin = async () => {
    const redirectUrl = chrome.identity.getRedirectURL()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    })

    if (error || !data?.url) return

    chrome.identity.launchWebAuthFlow(
      { url: data.url, interactive: true },
      async (callbackUrl) => {
        if (chrome.runtime.lastError || !callbackUrl) return
        const url = new URL(callbackUrl)
        const hashParams = new URLSearchParams(url.hash.substring(1))
        const access_token = hashParams.get('access_token')
        const refresh_token = hashParams.get('refresh_token')

        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
        }
      }
    )
  }

  const handleLogout = async () => {
    setWorkspaceMode('hub')
    await supabase.auth.signOut()
  }

  // Send Notification helper
  const sendNotification = async ({ recipientEmail, title, message, orderId = null }) => {
    if (!recipientEmail) return
    await supabase.from('notifications').insert([{
      recipient_email: recipientEmail.toLowerCase(),
      sender_name: profile?.company_name || userEmail,
      title,
      message,
      order_id: orderId,
    }])
  }

  // Derived data
  const myWorkspaceOrders = useMemo(() => orders.filter(o => o.user_id === userId), [orders, userId])
  const sharedOrders = useMemo(() => orders.filter(o => o.user_id !== userId), [orders, userId])
  const myTeamMembers = useMemo(() => employees.filter(e => e.owner_id === userId), [employees, userId])
  const myOwnCategories = useMemo(() => categories.filter(c => c.user_id === userId), [categories, userId])

  const employerCompanies = useMemo(() => {
    const ownerIds = [...new Set(
      employees
        .filter(e => e.email?.toLowerCase() === userEmail?.toLowerCase() && e.owner_id !== userId)
        .map(e => e.owner_id)
    )]
    return ownerIds.map(id => {
      const ownerProf = allProfiles.find(p => p.id === id)
      return {
        ownerId: id,
        companyName: ownerProf?.company_name || ownerProf?.email || 'Company',
      }
    })
  }, [employees, userEmail, userId, allProfiles])

  // Helper: Get next employee-specific sequence code for a given employee & category
  const getNextEmployeeCode = useCallback((empId, catId) => {
    if (!empId || !catId) return null
    const cat = myOwnCategories.find(c => c.id === catId)
    const prefix = getCategoryPrefix(cat?.name)
    const empCatOrders = myWorkspaceOrders.filter(o => o.assigned_to === empId && o.category_id === catId)
    return getNextSequenceCode(
      prefix,
      empCatOrders.map(o => o.employee_order_code),
      empCatOrders.length
    )
  }, [myOwnCategories, myWorkspaceOrders])

  // Auto-generate next company order code (scans highest existing CV_XXX number accurately)
  const autoBaseOrderName = useMemo(() => {
    const selectedCat = myOwnCategories.find(c => c.id === categoryId)
    const prefix = getCategoryPrefix(selectedCat?.name)
    const catOrders = myWorkspaceOrders.filter(o => o.category_id === categoryId)
    return getNextSequenceCode(
      prefix,
      catOrders.map(o => o.title),
      catOrders.length
    )
  }, [categoryId, myOwnCategories, myWorkspaceOrders])

  const previewEmployeeOrderCode = useMemo(() => {
    if (!assignedTo || !categoryId) return null
    return getNextEmployeeCode(assignedTo, categoryId)
  }, [assignedTo, categoryId, getNextEmployeeCode])

  const finalGeneratedTitle = titleSuffix.trim()
    ? `${autoBaseOrderName} (${titleSuffix.trim()})`
    : autoBaseOrderName

  // Create order
  const handleAddOrder = async (e) => {
    e.preventDefault()

    const empSeqCode = assignedTo ? getNextEmployeeCode(assignedTo, categoryId) : null

    const { data: insertedOrder, error } = await supabase.from('orders').insert([{
      user_id: userId,
      title: finalGeneratedTitle,
      client_name: clientName.trim() || null,
      category_id: categoryId || null,
      assigned_to: assignedTo || null,
      employee_order_code: empSeqCode,
      price: price ? parseFloat(price) : 0,
      client_payment_status: clientPaymentStatus,
      employee_fee: employeeFee ? parseFloat(employeeFee) : 0,
      payment_status: 'unpaid',
      priority,
      notes: notes.trim() || null,
      status: 'pending'
    }]).select().single()

    if (!error && insertedOrder) {
      if (assignedTo) {
        const emp = myTeamMembers.find(m => m.id === assignedTo)
        if (emp?.email) {
          await sendNotification({
            recipientEmail: emp.email,
            title: `New Order: ${empSeqCode || finalGeneratedTitle}`,
            message: `${profile?.company_name || 'Owner'} assigned ${empSeqCode || ''} (${finalGeneratedTitle}) to you.`,
            orderId: insertedOrder.id
          })
        }
      }
      setTitleSuffix('')
      setClientName('')
      setPrice('')
      setClientPaymentStatus('unpaid')
      setEmployeeFee('')
      setNotes('')
      setPriority('normal')
      setShowQuickAdd(false)
      fetchOrders()
    }
  }

  // Cycle Client Payment Status: unpaid -> half_paid -> full_paid -> unpaid
  const cycleClientPaymentStatus = async (order) => {
    const current = order.client_payment_status || 'unpaid'
    const next = current === 'unpaid' ? 'half_paid' : current === 'half_paid' ? 'full_paid' : 'unpaid'
    await supabase.from('orders').update({ client_payment_status: next }).eq('id', order.id)
    fetchOrders()
  }

  // Update order status
  const updateOrderStatus = async (order, newStatus) => {
    const updates = { status: newStatus }
    if (newStatus !== 'revision') updates.revision_note = null
    await supabase.from('orders').update(updates).eq('id', order.id)

    if (newStatus === 'done' && order.user_id !== userId) {
      const ownerProf = allProfiles.find(p => p.id === order.user_id)
      if (ownerProf?.email) {
        await sendNotification({
          recipientEmail: ownerProf.email,
          title: `Completed: ${order.employee_order_code || order.title}`,
          message: `${userEmail} marked "${order.employee_order_code ? `${order.employee_order_code} (${order.title})` : order.title}" as Completed.`,
          orderId: order.id
        })
      }
    }
    fetchOrders()
  }

  // Request revision
  const handleSendRevision = async (e) => {
    e.preventDefault()
    if (!revisionModalOrder) return
    const noteText = revisionNoteInput.trim() || 'Please check and update this order.'
    await supabase.from('orders').update({
      status: 'revision',
      revision_note: noteText
    }).eq('id', revisionModalOrder.id)

    const emp = myTeamMembers.find(m => m.id === revisionModalOrder.assigned_to)
    if (emp?.email) {
      await sendNotification({
        recipientEmail: emp.email,
        title: `Update Requested: ${revisionModalOrder.employee_order_code || revisionModalOrder.title}`,
        message: noteText,
        orderId: revisionModalOrder.id
      })
    }

    setRevisionModalOrder(null)
    setRevisionNoteInput('')
    fetchOrders()
  }

  // Toggle staff payment status
  const togglePaymentStatus = async (order) => {
    const nextPayment = order.payment_status === 'paid' ? 'unpaid' : 'paid'
    await supabase.from('orders').update({ payment_status: nextPayment }).eq('id', order.id)

    if (order.assigned_to) {
      const emp = myTeamMembers.find(m => m.id === order.assigned_to)
      if (emp?.email) {
        await sendNotification({
          recipientEmail: emp.email,
          title: nextPayment === 'paid'
            ? `Payment Sent: Rs. ${order.employee_fee || 0}`
            : `Payment Status: Unpaid`,
          message: `${profile?.company_name || 'Company'} marked "${order.employee_order_code || order.title}" as ${nextPayment.toUpperCase()}.`,
          orderId: order.id
        })
      }
    }
    fetchOrders()
  }

  const deleteOrder = async (id) => {
    await supabase.from('orders').delete().eq('id', id)
    fetchOrders()
  }

  // Notification actions
  const markAllNotificationsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    fetchNotifications()
  }

  const deleteSingleNotification = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id)
  }

  const clearAllNotifications = async () => {
    const ids = notifications.map(n => n.id)
    if (ids.length === 0) return
    setNotifications([])
    await supabase.from('notifications').delete().in('id', ids)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white/50 text-xs font-medium">
        Loading FlowSpace…
      </div>
    )
  }

  // Apple iOS Sign-In View for Side Panel
  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black px-5 text-center relative overflow-hidden">
        <div className="w-56 h-56 bg-[#0A84FF]/20 rounded-full blur-[90px] absolute -top-16 -left-16 pointer-events-none" />
        <div className="bg-[#1C1C1E]/90 backdrop-blur-2xl border border-white/10 rounded-[26px] p-6 w-full shadow-2xl animate-ios-spring relative z-10">
          <img src="/logo.svg" alt="FlowSpace" className="w-14 h-14 mx-auto mb-4 rounded-2xl shadow-md" />
          <h1 className="text-[22px] font-bold tracking-tight text-white mb-1.5">FlowSpace</h1>
          <p className="text-[13px] text-white/55 mb-6 leading-relaxed">
            Real-time studio & shared team orders right inside your browser side panel.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-white/90 text-black font-semibold py-3 px-4 rounded-2xl text-[14px] shadow-lg ios-press cursor-pointer"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-4 h-4" />
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  // Stats & Financial Calculations
  const myActiveOrdersCount = myWorkspaceOrders.filter(o => o.status !== 'done').length
  const totalCompanyCollected = myWorkspaceOrders.reduce((sum, o) => {
    const fee = Number(o.price || 0)
    const payStatus = o.client_payment_status || 'unpaid'
    if (payStatus === 'full_paid') return sum + fee
    if (payStatus === 'half_paid') return sum + fee / 2
    return sum
  }, 0)
  const totalStaffExpenses = myWorkspaceOrders
    .filter(o => o.assigned_to)
    .reduce((sum, o) => sum + Number(o.employee_fee || 0), 0)
  const netCompanyProfit = totalCompanyCollected - totalStaffExpenses

  const totalUnpaidToTeam = myWorkspaceOrders
    .filter(o => o.assigned_to && o.payment_status !== 'paid')
    .reduce((sum, o) => sum + Number(o.employee_fee || 0), 0)

  const filteredOwnerOrders = myWorkspaceOrders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchTitle = o.title.toLowerCase().includes(q)
      const matchClient = (o.client_name || '').toLowerCase().includes(q)
      const matchEmpCode = (o.employee_order_code || '').toLowerCase().includes(q)
      if (!matchTitle && !matchClient && !matchEmpCode) return false
    }
    return true
  })

  const visibleSharedOrders = sharedOrders.filter(o =>
    selectedCompanyOwnerId === 'all' ? true : o.user_id === selectedCompanyOwnerId
  )
  const sharedActiveCount = sharedOrders.filter(o => o.status !== 'done').length
  const sharedCompletedOrders = visibleSharedOrders.filter(o => o.status === 'done')
  const sharedRevisionOrders = sharedOrders.filter(o => o.status === 'revision')
  const sharedTotalEarned = sharedCompletedOrders.reduce((sum, o) => sum + Number(o.employee_fee || 0), 0)
  const sharedPaidAmount = sharedCompletedOrders
    .filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + Number(o.employee_fee || 0), 0)
  const sharedPendingPayout = sharedTotalEarned - sharedPaidAmount

  const unreadNotificationsCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="min-h-screen bg-black text-white pb-12">
      {/* Apple iOS Compact Side Panel Top Bar */}
      <header className="sticky top-0 z-30 bg-[#1C1C1E]/80 backdrop-blur-2xl border-b border-white/[0.08] px-3.5 h-13 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {workspaceMode !== 'hub' ? (
            <button
              onClick={() => {
                setWorkspaceMode('hub')
                fetchAllData()
              }}
              className="flex items-center gap-0.5 text-[#0A84FF] hover:text-[#409CFF] font-medium text-[14px] ios-press cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Workspaces</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="FlowSpace" className="w-6 h-6 rounded-md" />
              <span className="font-semibold text-[15px] tracking-tight text-white">FlowSpace</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                const nextState = !showNotifications
                setShowNotifications(nextState)
                if (nextState) markAllNotificationsRead()
              }}
              className="relative w-8 h-8 rounded-full bg-[#2C2C2E] hover:bg-[#3A3A3C] flex items-center justify-center text-white/90 ios-press cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#FF453A] text-white text-[9px] font-bold min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed left-3 right-3 top-14 bg-[#1C1C1E]/95 backdrop-blur-2xl border border-white/15 rounded-[20px] shadow-2xl p-3.5 z-50 space-y-2.5 animate-ios-pop">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-[12px] font-semibold text-white">
                    Notifications ({notifications.length})
                  </span>
                  <div className="flex items-center gap-2.5">
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        className="text-[11px] font-medium text-[#FF453A] hover:opacity-80 cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <p className="text-[12px] text-white/40 text-center py-6">No notifications</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        className="bg-[#2C2C2E]/85 border border-white/[0.06] rounded-xl p-2.5 text-[11px] flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#0A84FF]">{n.sender_name}</span>
                            <span className="text-[10px] text-white/40">
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="font-semibold text-white text-[12px]">{n.title}</div>
                          {n.message && <p className="text-white/65 leading-snug">{n.message}</p>}
                        </div>
                        <button
                          onClick={() => deleteSingleNotification(n.id)}
                          className="w-5 h-5 rounded-full bg-white/5 hover:bg-[#FF453A]/20 text-white/50 hover:text-[#FF453A] flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-full bg-[#2C2C2E] hover:bg-[#3A3A3C] flex items-center justify-center text-white/75 hover:text-white ios-press cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* HUB VIEW: TWO LARGE WORKSPACE CARDS */}
      {workspaceMode === 'hub' && (
        <main className="p-4 space-y-4 animate-ios-spring">
          <div className="pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0A84FF]">
              Workspaces
            </p>
            <h1 className="text-[22px] font-bold tracking-tight text-white">
              Select Workspace
            </h1>
            <p className="text-[12px] text-white/50 truncate">{userEmail}</p>
          </div>

          {/* CARD 1: MY ORDERS (OWNER) */}
          <button
            onClick={() => setWorkspaceMode('my_orders')}
            className="w-full group text-left bg-[#1C1C1E] hover:bg-[#242426] border border-white/[0.08] hover:border-[#0A84FF]/60 rounded-[24px] p-5 transition-all shadow-xl space-y-4 ios-press cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-[#0A84FF]/15 flex items-center justify-center text-[#0A84FF]">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold bg-[#0A84FF]/15 text-[#0A84FF] px-3 py-0.5 rounded-full">
                Owner
              </span>
            </div>

            <div>
              <h2 className="text-[18px] font-bold text-white">My Orders</h2>
              <p className="text-[12px] text-[#0A84FF] font-medium">{profile?.company_name || 'My Studio'}</p>
              <p className="text-[12px] text-white/55 mt-1.5 leading-relaxed">
                Create auto-numbered orders, track client payments & view studio profit.
              </p>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-[12px]">
              <div className="flex gap-3">
                <span className="text-white/60"><strong className="text-white">{myActiveOrdersCount}</strong> Active</span>
                <span className="text-white/60"><strong className="text-[#30D158]">Rs. {netCompanyProfit.toLocaleString()}</strong> Profit</span>
              </div>
              <span className="w-7 h-7 rounded-full bg-white/[0.06] group-hover:bg-[#0A84FF] text-white/70 group-hover:text-white flex items-center justify-center transition">
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* CARD 2: SHARED ORDERS (EMPLOYEE) */}
          <button
            onClick={() => setWorkspaceMode('shared_orders')}
            className="w-full group text-left bg-[#1C1C1E] hover:bg-[#242426] border border-white/[0.08] hover:border-[#30D158]/60 rounded-[24px] p-5 transition-all shadow-xl space-y-4 ios-press cursor-pointer relative"
          >
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-[#30D158]/15 flex items-center justify-center text-[#30D158]">
                <Briefcase className="w-5 h-5" />
              </div>
              {sharedRevisionOrders.length > 0 ? (
                <span className="bg-[#FF453A] text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                  {sharedRevisionOrders.length} Update Needed
                </span>
              ) : (
                <span className="text-[11px] font-semibold bg-[#30D158]/15 text-[#30D158] px-3 py-0.5 rounded-full">
                  Employee
                </span>
              )}
            </div>

            <div>
              <h2 className="text-[18px] font-bold text-white">Shared Orders</h2>
              <p className="text-[12px] text-[#30D158] font-medium">
                {employerCompanies.length} Connected {employerCompanies.length === 1 ? 'Company' : 'Companies'}
              </p>
              <p className="text-[12px] text-white/55 mt-1.5 leading-relaxed">
                Track tasks assigned to you by companies, check sequence numbers & earnings.
              </p>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-[12px]">
              <div className="flex gap-3">
                <span className="text-white/60"><strong className="text-white">{sharedActiveCount}</strong> Active</span>
                <span className="text-white/60"><strong className="text-[#30D158]">Rs. {sharedTotalEarned.toLocaleString()}</strong> Earned</span>
              </div>
              <span className="w-7 h-7 rounded-full bg-white/[0.06] group-hover:bg-[#30D158] text-white/70 group-hover:text-black flex items-center justify-center transition">
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </button>
        </main>
      )}

      {/* SECTION 1: MY ORDERS (OWNER SIDE PANEL VIEW) */}
      {workspaceMode === 'my_orders' && (
        <main className="p-3.5 space-y-3.5 animate-ios-spring">
          {/* Header + New Order Button */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[18px] font-bold tracking-tight text-white">
                {profile?.company_name || 'My Orders'}
              </h1>
              <p className="text-[11px] text-white/50">
                Profit: <strong className="text-[#30D158]">Rs. {netCompanyProfit.toLocaleString()}</strong> · Due: Rs. {totalUnpaidToTeam.toLocaleString()}
              </p>
            </div>

            <button
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              className="flex items-center gap-1 bg-[#0A84FF] hover:bg-[#409CFF] text-white text-[12px] font-semibold px-3 py-2 rounded-full shadow ios-press cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> {showQuickAdd ? 'Close' : 'New Order'}
            </button>
          </div>

          {/* Quick Add Auto-Numbered Order Form */}
          {showQuickAdd && (
            <form onSubmit={handleAddOrder} className="bg-[#1C1C1E] border border-white/10 rounded-[20px] p-3.5 space-y-2.5 animate-ios-pop">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-white/70">Create Order</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] bg-[#0A84FF]/15 text-[#0A84FF] px-2.5 py-0.5 rounded-full font-semibold">
                    {finalGeneratedTitle}
                  </span>
                  {previewEmployeeOrderCode && (
                    <span className="text-[11px] bg-[#30D158]/15 text-[#30D158] px-2.5 py-0.5 rounded-full font-semibold">
                      Emp: {previewEmployeeOrderCode}
                    </span>
                  )}
                </div>
              </div>

              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="w-full bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white"
              >
                <option value="" disabled>Select Category *</option>
                {myOwnCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              <div className="flex items-center bg-[#2C2C2E] border border-white/[0.08] rounded-xl overflow-hidden">
                <span className="bg-white/[0.06] text-[#0A84FF] font-semibold text-[12px] px-3 py-2 border-r border-white/10">
                  {autoBaseOrderName}
                </span>
                <input
                  type="text"
                  placeholder="Optional note (e.g. from CV_102)"
                  value={titleSuffix}
                  onChange={(e) => setTitleSuffix(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2 text-[13px] text-white placeholder:text-white/35 focus:outline-none"
                />
              </div>

              <input
                type="text"
                placeholder="Client Name / WhatsApp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-white/35"
              />

              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white"
              >
                <option value="">Assign: Myself</option>
                {myTeamMembers.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Client Fee (Rs.)"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-white/35"
                />
                <select
                  value={clientPaymentStatus}
                  onChange={(e) => setClientPaymentStatus(e.target.value)}
                  className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-2.5 py-2 text-[12px] text-white"
                >
                  <option value="unpaid">Client: Unpaid</option>
                  <option value="half_paid">Client: Half Paid</option>
                  <option value="full_paid">Client: Full Paid</option>
                </select>
              </div>

              <input
                type="number"
                placeholder="Staff Payout Fee (Rs.)"
                value={employeeFee}
                onChange={(e) => setEmployeeFee(e.target.value)}
                className="w-full bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-white/35"
              />

              <input
                type="text"
                placeholder="Instructions (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-white/35"
              />

              <button
                type="submit"
                className="w-full bg-[#0A84FF] hover:bg-[#409CFF] text-white font-semibold py-2.5 rounded-xl text-[13px] ios-press cursor-pointer"
              >
                Save Order
              </button>
            </form>
          )}

          {/* Compact Search & Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search ID, Emp ID or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-white/[0.08] rounded-xl pl-8 pr-3 py-1.5 text-[12px] text-white placeholder:text-white/35"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#1C1C1E] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-[12px] text-white/85"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="revision">Update Needed</option>
              <option value="done">Completed</option>
            </select>
          </div>

          {/* Orders List */}
          <div className="space-y-2.5">
            {filteredOwnerOrders.length === 0 ? (
              <p className="text-center text-white/40 text-[12px] py-10">No orders found.</p>
            ) : (
              filteredOwnerOrders.map(order => {
                const category = categories.find(c => c.id === order.category_id)
                const assignee = myTeamMembers.find(e => e.id === order.assigned_to)
                const clientPayKey = order.client_payment_status || 'unpaid'
                return (
                  <div
                    key={order.id}
                    className={`bg-[#1C1C1E] border rounded-[18px] p-3.5 space-y-2.5 ${
                      order.status === 'revision' ? 'border-[#FF453A]/50' : 'border-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {category && (
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: `${category.color}22`, color: category.color }}
                            >
                              {category.name}
                            </span>
                          )}
                          <span className="text-[10px] text-white/50">
                            {assignee
                              ? `→ ${assignee.name}${order.employee_order_code ? ` (${order.employee_order_code})` : ''}`
                              : '→ Myself'}
                          </span>
                        </div>
                        <h3 className="text-[14px] font-semibold text-white leading-snug">{order.title}</h3>
                        {order.client_name && <p className="text-[11px] text-white/50">Client: {order.client_name}</p>}
                      </div>

                      <button
                        onClick={() => deleteOrder(order.id)}
                        className="text-white/35 hover:text-[#FF453A] p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {order.revision_note && (
                      <div className="text-[11px] text-[#FF453A] bg-[#FF453A]/10 rounded-lg px-2.5 py-1">
                        Note: {order.revision_note}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-white/[0.06]">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          onClick={() => cycleClientPaymentStatus(order)}
                          className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold border ios-press cursor-pointer ${CLIENT_PAYMENT_CONFIG[clientPayKey]?.color}`}
                          title="Click: Unpaid → Half Paid → Full Paid"
                        >
                          <Wallet className="w-3 h-3" />
                          {CLIENT_PAYMENT_CONFIG[clientPayKey]?.label}
                        </button>

                        {order.assigned_to && (
                          <button
                            onClick={() => togglePaymentStatus(order)}
                            className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold border ios-press cursor-pointer ${
                              order.payment_status === 'paid'
                                ? 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30'
                                : 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30'
                            }`}
                          >
                            <DollarSign className="w-3 h-3" />
                            {order.payment_status === 'paid' ? 'Staff Paid' : 'Pay Staff'}
                          </button>
                        )}

                        {order.assigned_to && (
                          <button
                            onClick={() => {
                              setRevisionModalOrder(order)
                              setRevisionNoteInput(order.revision_note || '')
                            }}
                            className="px-2 py-1 rounded-lg text-[10px] font-medium bg-[#FF453A]/15 text-[#FF453A] ios-press cursor-pointer"
                          >
                            Update
                          </button>
                        )}
                      </div>

                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order, e.target.value)}
                        className={`border rounded-lg px-2 py-1 text-[10px] font-semibold cursor-pointer ${STATUS_CONFIG[order.status]?.color}`}
                      >
                        <option value="pending" className="bg-[#1C1C1E] text-white">Pending</option>
                        <option value="in_progress" className="bg-[#1C1C1E] text-white">In Progress</option>
                        <option value="review" className="bg-[#1C1C1E] text-white">In Review</option>
                        <option value="revision" className="bg-[#1C1C1E] text-white">Update Needed</option>
                        <option value="done" className="bg-[#1C1C1E] text-white">Completed</option>
                      </select>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </main>
      )}

      {/* SECTION 2: SHARED ORDERS (EMPLOYEE SIDE PANEL VIEW) */}
      {workspaceMode === 'shared_orders' && (
        <main className="p-3.5 space-y-3.5 animate-ios-spring">
          {employerCompanies.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCompanyOwnerId('all')}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap ios-press cursor-pointer ${
                  selectedCompanyOwnerId === 'all' ? 'bg-[#30D158] text-black' : 'bg-[#1C1C1E] text-white/75'
                }`}
              >
                All ({employerCompanies.length})
              </button>
              {employerCompanies.map(comp => (
                <button
                  key={comp.ownerId}
                  onClick={() => setSelectedCompanyOwnerId(comp.ownerId)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap ios-press cursor-pointer ${
                    selectedCompanyOwnerId === comp.ownerId ? 'bg-[#30D158] text-black' : 'bg-[#1C1C1E] text-white/75'
                  }`}
                >
                  {comp.companyName}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[18px] p-3">
              <span className="text-[11px] text-white/50 block">Completed</span>
              <strong className="text-[20px] font-bold text-[#30D158]">{sharedCompletedOrders.length}</strong>
            </div>
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[18px] p-3">
              <span className="text-[11px] text-white/50 block">Total Earned</span>
              <strong className="text-[18px] font-bold text-[#32ADE6]">Rs. {sharedTotalEarned.toLocaleString()}</strong>
              <span className="text-[10px] text-[#FF9F0A] block">Pending: Rs. {sharedPendingPayout.toLocaleString()}</span>
            </div>
          </div>

          {sharedRevisionOrders.length > 0 && (
            <div className="bg-[#FF453A]/15 border border-[#FF453A]/30 rounded-2xl p-3 flex items-center gap-2.5 text-[12px] text-[#FF453A]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><strong>{sharedRevisionOrders.length}</strong> order(s) need updates!</span>
            </div>
          )}

          <div className="space-y-2.5">
            {visibleSharedOrders.length === 0 ? (
              <p className="text-center text-white/40 text-[12px] py-10">No shared orders assigned yet.</p>
            ) : (
              visibleSharedOrders.map(order => {
                const category = categories.find(c => c.id === order.category_id)
                const ownerProf = allProfiles.find(p => p.id === order.user_id)
                return (
                  <div
                    key={order.id}
                    className={`bg-[#1C1C1E] border rounded-[18px] p-3.5 space-y-2.5 ${
                      order.status === 'revision'
                        ? 'border-[#FF453A]/50'
                        : order.status === 'done'
                        ? 'border-white/[0.04] opacity-70'
                        : 'border-white/[0.07]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold bg-[#0A84FF]/15 text-[#0A84FF] px-2 py-0.5 rounded-full">
                        {ownerProf?.company_name || 'Company'}
                      </span>
                      {category && (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${category.color}22`, color: category.color }}
                        >
                          {category.name}
                        </span>
                      )}
                      {order.employee_order_code && (
                        <span className="text-[10px] font-medium bg-white/[0.06] text-white/55 px-2 py-0.5 rounded-full">
                          Ref: {order.title}
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-[15px] font-bold text-white">
                        {order.employee_order_code || order.title}
                      </h3>
                      {order.notes && <p className="text-[11px] text-white/50 italic mt-0.5">“{order.notes}”</p>}
                    </div>

                    {order.revision_note && (
                      <div className="text-[11px] text-[#FF453A] bg-[#FF453A]/15 rounded-lg px-2.5 py-1.5">
                        <strong>Update Request:</strong> {order.revision_note}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                      <div className="text-[11px]">
                        <span className="text-[#32ADE6] font-semibold">Rs. {order.employee_fee || 0}</span>
                        <span className={`ml-2 font-semibold ${order.payment_status === 'paid' ? 'text-[#30D158]' : 'text-[#FF9F0A]'}`}>
                          · {order.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>

                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order, e.target.value)}
                        className={`border rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${STATUS_CONFIG[order.status]?.color}`}
                      >
                        <option value="pending" className="bg-[#1C1C1E] text-white">Pending</option>
                        <option value="in_progress" className="bg-[#1C1C1E] text-white">In Progress</option>
                        <option value="review" className="bg-[#1C1C1E] text-white">In Review</option>
                        <option value="revision" className="bg-[#1C1C1E] text-white">Update Needed</option>
                        <option value="done" className="bg-[#1C1C1E] text-white">Completed</option>
                      </select>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </main>
      )}

      {/* Apple iOS Sheet Modal for Revision Request */}
      {revisionModalOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSendRevision}
            className="bg-[#1C1C1E] border border-white/15 rounded-[24px] w-full p-4 space-y-3 shadow-2xl animate-ios-pop"
          >
            <h3 className="text-[15px] font-bold text-white">
              Request Update · {revisionModalOrder.employee_order_code || revisionModalOrder.title}
            </h3>
            <textarea
              rows="3"
              required
              placeholder="What needs to be changed?"
              value={revisionNoteInput}
              onChange={(e) => setRevisionNoteInput(e.target.value)}
              className="w-full bg-[#2C2C2E] border border-white/10 rounded-xl p-3 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#FF453A]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevisionModalOrder(null)}
                className="px-3.5 py-2 rounded-xl text-[12px] bg-[#2C2C2E] text-white/80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-[#FF453A] text-white cursor-pointer"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}