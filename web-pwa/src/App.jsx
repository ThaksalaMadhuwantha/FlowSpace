import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import {
  Plus, Users, Tag, LogOut, Trash2, LayoutGrid, Search, Building2,
  Bell, CheckCircle2, AlertTriangle, DollarSign, Briefcase, Edit3, Check,
  ChevronLeft, ChevronRight, X, Wallet, Hash
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
  unpaid: { label: 'Client: Unpaid', color: 'bg-white/[0.06] text-white/65 border-white/15' },
  half_paid: { label: 'Client: Half Paid', color: 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30' },
  full_paid: { label: 'Client: Full Paid', color: 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30' },
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

  // Core data states
  const [profile, setProfile] = useState(null)
  const [allProfiles, setAllProfiles] = useState([])
  const [orders, setOrders] = useState([])
  const [categories, setCategories] = useState([])
  const [employees, setEmployees] = useState([])
  const [notifications, setNotifications] = useState([])

  // Workspace view mode: 'hub' | 'my_orders' | 'shared_orders'
  const [workspaceMode, setWorkspaceMode] = useState('hub')
  const [selectedCompanyOwnerId, setSelectedCompanyOwnerId] = useState('all')

  // Owner sub-tabs: 'orders' | 'team' | 'categories'
  const [ownerTab, setOwnerTab] = useState('orders')
  const [statusFilter, setStatusFilter] = useState('all')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [clientPayFilter, setClientPayFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Company name editing state
  const [editingCompany, setEditingCompany] = useState(false)
  const [companyNameInput, setCompanyNameInput] = useState('')

  // Notifications popover toggle
  const [showNotifications, setShowNotifications] = useState(false)

  // Quick Add Order Form states
  const [categoryId, setCategoryId] = useState('')
  const [titleSuffix, setTitleSuffix] = useState('')
  const [clientName, setClientName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [price, setPrice] = useState('')
  const [clientPaymentStatus, setClientPaymentStatus] = useState('unpaid')
  const [employeeFee, setEmployeeFee] = useState('')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')

  // Add Employee Form states
  const [empName, setEmpName] = useState('')
  const [empEmail, setEmpEmail] = useState('')
  const [empRole, setEmpRole] = useState('Designer')

  // Add Category Form states
  const [catName, setCatName] = useState('')
  const [catColor, setCatColor] = useState('#0A84FF')

  // Revision sheet modal state
  const [revisionModalOrder, setRevisionModalOrder] = useState(null)
  const [revisionNoteInput, setRevisionNoteInput] = useState('')

  const userId = session?.user?.id
  const userEmail = session?.user?.email

  // Load user profile & all profiles
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
          setCompanyNameInput(created.company_name)
          setAllProfiles([...data, created])
          return
        }
      } else {
        setProfile(mine)
        setCompanyNameInput(mine.company_name || 'My Studio')
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
      .limit(30)
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

  // Auth listener
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

  // Initial load + Real-time subscriptions
  useEffect(() => {
    if (!userId) return

    let isMounted = true
    const initLoad = async () => {
      if (isMounted) await fetchAllData()
    }
    initLoad()

    const channel = supabase
      .channel('flowspace-ios-realtime')
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

  // Return to Workspace Hub and refresh data on minimize or tab switch
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

  // Helper to send a notification
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

  // Auth actions
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
  }

  const handleLogout = async () => {
    setWorkspaceMode('hub')
    await supabase.auth.signOut()
  }

  // Update company name
  const handleSaveCompanyName = async () => {
    if (!companyNameInput.trim()) return
    await supabase.from('profiles').update({ company_name: companyNameInput.trim() }).eq('id', userId)
    setEditingCompany(false)
    fetchProfiles()
  }

  // Derived data for Owner and Employee modes
  const myWorkspaceOrders = useMemo(() => orders.filter(o => o.user_id === userId), [orders, userId])
  const sharedOrders = useMemo(() => orders.filter(o => o.user_id !== userId), [orders, userId])
  const myTeamMembers = useMemo(() => employees.filter(e => e.owner_id === userId), [employees, userId])
  const myOwnCategories = useMemo(() => categories.filter(c => c.user_id === userId), [categories, userId])

  // Companies that hired the current user as an employee
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
        companyName: ownerProf?.company_name || ownerProf?.email || 'Company Workspace',
        ownerEmail: ownerProf?.email || ''
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

  // Create new order
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
            title: `New Order Assigned: ${empSeqCode || finalGeneratedTitle}`,
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

  // Update order status & send relevant notifications
  const updateOrderStatus = async (order, newStatus) => {
    const updates = { status: newStatus }
    if (newStatus !== 'revision') {
      updates.revision_note = null
    }
    await supabase.from('orders').update(updates).eq('id', order.id)

    if (newStatus === 'done' && order.user_id !== userId) {
      const ownerProf = allProfiles.find(p => p.id === order.user_id)
      if (ownerProf?.email) {
        await sendNotification({
          recipientEmail: ownerProf.email,
          title: `Order Completed: ${order.employee_order_code || order.title}`,
          message: `${userEmail} marked "${order.employee_order_code ? `${order.employee_order_code} (${order.title})` : order.title}" as Completed.`,
          orderId: order.id
        })
      }
    }

    fetchOrders()
  }

  // Request revision on an order (Owner -> Employee)
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

  // Toggle staff payment status (Paid / Unpaid)
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
            : `Payment Status Updated: Unpaid`,
          message: `${profile?.company_name || 'Company'} marked "${order.employee_order_code || order.title}" as ${nextPayment.toUpperCase()}.`,
          orderId: order.id
        })
      }
    }

    fetchOrders()
  }

  // Re-assign order & calculate employee's next sequence code
  const updateOrderAssignee = async (order, empId) => {
    const newEmpCode = empId ? getNextEmployeeCode(empId, order.category_id) : null
    await supabase.from('orders').update({
      assigned_to: empId || null,
      employee_order_code: newEmpCode
    }).eq('id', order.id)

    if (empId) {
      const emp = myTeamMembers.find(m => m.id === empId)
      if (emp?.email) {
        await sendNotification({
          recipientEmail: emp.email,
          title: `Task Assigned: ${newEmpCode || order.title}`,
          message: `${profile?.company_name || 'Owner'} assigned ${newEmpCode || ''} (${order.title}) to you.`,
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

  // Team member handlers
  const handleAddEmployee = async (e) => {
    e.preventDefault()
    if (!empName.trim() || !empEmail.trim()) return
    await supabase.from('employees').insert([{
      owner_id: userId,
      name: empName.trim(),
      email: empEmail.trim().toLowerCase(),
      role: empRole.trim() || 'Designer'
    }])

    await sendNotification({
      recipientEmail: empEmail.trim().toLowerCase(),
      title: `Invited to ${profile?.company_name || 'Workspace'}`,
      message: `You were added as a ${empRole.trim() || 'Designer'}. Open Shared Orders to view tasks.`
    })

    setEmpName('')
    setEmpEmail('')
    fetchEmployees()
  }

  const deleteEmployee = async (id) => {
    await supabase.from('employees').delete().eq('id', id)
    fetchEmployees()
  }

  // Category handlers
  const handleAddCategory = async (e) => {
    e.preventDefault()
    if (!catName.trim()) return
    const { data } = await supabase.from('categories').insert([{
      user_id: userId,
      name: catName.trim(),
      color: catColor
    }]).select().single()
    setCatName('')
    if (data) setCategoryId(data.id)
    fetchCategories()
  }

  const deleteCategory = async (id) => {
    await supabase.from('categories').delete().eq('id', id)
    fetchCategories()
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
      <div className="min-h-screen flex items-center justify-center bg-black text-white/50 text-sm font-medium tracking-tight">
        Loading FlowSpace…
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black px-5 relative overflow-hidden">
        <div className="w-80 h-80 bg-[#0A84FF]/20 rounded-full blur-[120px] absolute -top-20 -left-20 pointer-events-none" />
        <div className="w-80 h-80 bg-[#5E5CE6]/20 rounded-full blur-[120px] absolute -bottom-20 -right-20 pointer-events-none" />

        <div className="max-w-sm w-full bg-[#1C1C1E]/90 backdrop-blur-2xl border border-white/10 rounded-[28px] p-8 text-center shadow-2xl animate-ios-spring relative z-10">
          <img src="/logo.svg" alt="FlowSpace" className="w-16 h-16 mx-auto mb-5 rounded-[18px] shadow-lg" />
          <h1 className="text-[26px] font-bold tracking-tight text-white mb-2">
            FlowSpace
          </h1>
          <p className="text-white/60 text-[15px] leading-relaxed mb-8">
            Manage your studio orders, assign team tasks, and track shared company work seamlessly.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-white/90 text-black font-semibold text-[15px] py-3.5 px-5 rounded-2xl shadow-lg ios-press cursor-pointer"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  const getActiveWorkload = (empId) =>
    myWorkspaceOrders.filter(o => o.assigned_to === empId && o.status !== 'done').length

  const filteredOwnerOrders = myWorkspaceOrders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (employeeFilter === 'me' && o.assigned_to !== null) return false
    if (employeeFilter !== 'all' && employeeFilter !== 'me' && o.assigned_to !== employeeFilter) return false
    if (paymentFilter !== 'all' && o.payment_status !== paymentFilter) return false
    if (clientPayFilter !== 'all' && (o.client_payment_status || 'unpaid') !== clientPayFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchTitle = o.title.toLowerCase().includes(q)
      const matchClient = (o.client_name || '').toLowerCase().includes(q)
      const matchEmpCode = (o.employee_order_code || '').toLowerCase().includes(q)
      if (!matchTitle && !matchClient && !matchEmpCode) return false
    }
    return true
  })

  // Company Financial Calculations
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

  const categoryBreakdown = sharedCompletedOrders.reduce((acc, order) => {
    const cat = categories.find(c => c.id === order.category_id)
    const name = cat ? cat.name : 'General'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {})

  const unreadNotificationsCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-[#1C1C1E]/75 backdrop-blur-2xl border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {workspaceMode !== 'hub' ? (
              <button
                onClick={() => {
                  setWorkspaceMode('hub')
                  fetchAllData()
                }}
                className="flex items-center gap-1 text-[#0A84FF] hover:text-[#409CFF] font-medium text-[15px] ios-press cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Workspaces</span>
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <img src="/logo.svg" alt="FlowSpace" className="w-8 h-8 rounded-[10px]" />
                <span className="font-semibold text-[18px] tracking-tight text-white">FlowSpace</span>
              </div>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <button
                onClick={() => {
                  const nextState = !showNotifications
                  setShowNotifications(nextState)
                  if (nextState) markAllNotificationsRead()
                }}
                className="relative w-9 h-9 rounded-full bg-[#2C2C2E] hover:bg-[#3A3A3C] flex items-center justify-center text-white/90 ios-press cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#FF453A] text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-[#1C1C1E]/95 backdrop-blur-2xl border border-white/15 rounded-[22px] shadow-2xl p-4 z-50 space-y-3 animate-ios-pop">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <span className="text-[13px] font-semibold text-white">
                      Notifications ({notifications.length})
                    </span>
                    <div className="flex items-center gap-3">
                      {notifications.length > 0 && (
                        <button
                          onClick={clearAllNotifications}
                          className="text-[12px] font-medium text-[#FF453A] hover:opacity-80 cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2 pr-0.5">
                    {notifications.length === 0 ? (
                      <p className="text-[13px] text-white/40 text-center py-8">No new notifications</p>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className="bg-[#2C2C2E]/80 border border-white/[0.06] rounded-2xl p-3 text-xs flex items-start justify-between gap-2.5"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#0A84FF]">{n.sender_name}</span>
                              <span className="text-[11px] text-white/40">
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="font-semibold text-white text-[13px]">{n.title}</div>
                            {n.message && <p className="text-white/65 text-[12px] leading-snug">{n.message}</p>}
                          </div>

                          <button
                            onClick={() => deleteSingleNotification(n.id)}
                            className="w-6 h-6 rounded-full bg-white/5 hover:bg-[#FF453A]/20 text-white/50 hover:text-[#FF453A] flex items-center justify-center shrink-0 transition cursor-pointer"
                            title="Clear"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <span className="hidden md:inline-block text-[13px] text-white/50 bg-[#2C2C2E]/70 px-3 py-1.5 rounded-full">
              {userEmail}
            </span>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[13px] font-medium text-white/80 hover:text-white bg-[#2C2C2E] hover:bg-[#3A3A3C] px-3.5 py-1.5 rounded-full ios-press cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* HUB VIEW: TWO LARGE WORKSPACE CARDS */}
      {workspaceMode === 'hub' && (
        <main className="max-w-4xl mx-auto px-5 pt-12 space-y-8 animate-ios-spring">
          <div className="space-y-1.5">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-[#0A84FF]">
              Workspaces
            </p>
            <h1 className="text-[32px] sm:text-[36px] font-bold tracking-tight text-white">
              Choose Your Workspace
            </h1>
            <p className="text-[15px] text-white/55">
              Switch between managing your own studio orders or collaborating with companies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* BOX 1: MY ORDERS */}
            <button
              onClick={() => setWorkspaceMode('my_orders')}
              className="group text-left bg-[#1C1C1E] hover:bg-[#242426] border border-white/[0.08] hover:border-[#0A84FF]/60 rounded-[28px] p-7 transition-all shadow-2xl flex flex-col justify-between space-y-7 ios-press cursor-pointer"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-[18px] bg-[#0A84FF]/15 flex items-center justify-center text-[#0A84FF] group-hover:scale-105 transition-transform">
                    <Building2 className="w-7 h-7" />
                  </div>
                  <span className="text-[12px] font-semibold bg-[#0A84FF]/15 text-[#0A84FF] px-3.5 py-1 rounded-full">
                    Owner
                  </span>
                </div>

                <div>
                  <h2 className="text-[22px] font-bold tracking-tight text-white">
                    My Orders
                  </h2>
                  <p className="text-[14px] text-[#0A84FF] font-medium mt-0.5">
                    {profile?.company_name || 'My Studio'}
                  </p>
                  <p className="text-[14px] text-white/55 mt-2.5 leading-relaxed">
                    Create auto-numbered orders, track employee order sequences, and manage studio revenue & payouts.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
                <div className="flex gap-4 text-[13px]">
                  <span className="text-white/60">
                    <strong className="text-white font-semibold">{myActiveOrdersCount}</strong> Active
                  </span>
                  <span className="text-white/60">
                    <strong className="text-[#30D158] font-semibold">Rs. {netCompanyProfit.toLocaleString()}</strong> Profit
                  </span>
                </div>
                <span className="w-8 h-8 rounded-full bg-white/[0.06] group-hover:bg-[#0A84FF] text-white/70 group-hover:text-white flex items-center justify-center transition">
                  <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </button>

            {/* BOX 2: SHARED ORDERS */}
            <button
              onClick={() => setWorkspaceMode('shared_orders')}
              className="group text-left bg-[#1C1C1E] hover:bg-[#242426] border border-white/[0.08] hover:border-[#30D158]/60 rounded-[28px] p-7 transition-all shadow-2xl flex flex-col justify-between space-y-7 ios-press cursor-pointer relative"
            >
              {sharedRevisionOrders.length > 0 && (
                <span className="absolute top-6 right-6 bg-[#FF453A] text-white text-[12px] font-semibold px-3 py-1 rounded-full shadow-lg">
                  {sharedRevisionOrders.length} Update Needed
                </span>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-[18px] bg-[#30D158]/15 flex items-center justify-center text-[#30D158] group-hover:scale-105 transition-transform">
                    <Briefcase className="w-7 h-7" />
                  </div>
                  {sharedRevisionOrders.length === 0 && (
                    <span className="text-[12px] font-semibold bg-[#30D158]/15 text-[#30D158] px-3.5 py-1 rounded-full">
                      Employee
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-[22px] font-bold tracking-tight text-white">
                    Shared Orders
                  </h2>
                  <p className="text-[14px] text-[#30D158] font-medium mt-0.5">
                    {employerCompanies.length} Connected {employerCompanies.length === 1 ? 'Company' : 'Companies'}
                  </p>
                  <p className="text-[14px] text-white/55 mt-2.5 leading-relaxed">
                    View your personal order sequence numbers, check update alerts, and track your total earnings.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
                <div className="flex gap-4 text-[13px]">
                  <span className="text-white/60">
                    <strong className="text-white font-semibold">{sharedActiveCount}</strong> Active
                  </span>
                  <span className="text-white/60">
                    <strong className="text-[#30D158] font-semibold">Rs. {sharedTotalEarned.toLocaleString()}</strong> Earned
                  </span>
                </div>
                <span className="w-8 h-8 rounded-full bg-white/[0.06] group-hover:bg-[#30D158] text-white/70 group-hover:text-black flex items-center justify-center transition">
                  <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </button>
          </div>
        </main>
      )}

      {/* SECTION 1: MY ORDERS (OWNER WORKSPACE) */}
      {workspaceMode === 'my_orders' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-7 space-y-6 animate-ios-spring">
          {/* Company Brand Header */}
          <div className="bg-[#1C1C1E] border border-white/[0.08] rounded-[24px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#0A84FF]/15 flex items-center justify-center text-[#0A84FF]">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0A84FF]">
                  Studio / Company Name
                </div>
                {editingCompany ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={companyNameInput}
                      onChange={(e) => setCompanyNameInput(e.target.value)}
                      className="bg-[#2C2C2E] border border-[#0A84FF] rounded-xl px-3 py-1.5 text-[15px] text-white focus:outline-none"
                      placeholder="e.g. UTM Graphics"
                    />
                    <button
                      onClick={handleSaveCompanyName}
                      className="bg-[#0A84FF] hover:bg-[#409CFF] text-white font-semibold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 ios-press cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="text-[22px] font-bold tracking-tight text-white">
                      {profile?.company_name || 'My Studio'}
                    </h1>
                    <button
                      onClick={() => setEditingCompany(true)}
                      className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/15 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
                      title="Edit Studio Name"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-[13px] text-white/50">
              Total Orders: <strong className="text-white">{myWorkspaceOrders.length}</strong> · Completed: <strong className="text-[#30D158]">{myWorkspaceOrders.filter(o => o.status === 'done').length}</strong>
            </div>
          </div>

          {/* Financial & Orders Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Total Revenue Collected</div>
              <div className="text-[24px] sm:text-[26px] font-bold tracking-tight text-[#32ADE6] mt-0.5">
                Rs. {totalCompanyCollected.toLocaleString()}
              </div>
              <div className="text-[11px] text-white/40 mt-0.5">From paid & half-paid orders</div>
            </div>

            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Net Company Profit</div>
              <div className="text-[24px] sm:text-[26px] font-bold tracking-tight text-[#30D158] mt-0.5">
                Rs. {netCompanyProfit.toLocaleString()}
              </div>
              <div className="text-[11px] text-white/40 mt-0.5">
                After Rs. {totalStaffExpenses.toLocaleString()} staff fees
              </div>
            </div>

            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Pending Staff Payouts</div>
              <div className="text-[24px] sm:text-[26px] font-bold tracking-tight text-[#FF9F0A] mt-0.5">
                Rs. {totalUnpaidToTeam.toLocaleString()}
              </div>
              <div className="text-[11px] text-white/40 mt-0.5">Unpaid team balance</div>
            </div>

            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Active / Postponed</div>
              <div className="text-[24px] sm:text-[26px] font-bold tracking-tight text-white mt-0.5">
                {myActiveOrdersCount}
              </div>
              <div className="text-[11px] text-white/40 mt-0.5">{myTeamMembers.length} Team Members</div>
            </div>
          </div>

          {/* Segmented Control */}
          <div className="inline-flex bg-[#1C1C1E] p-1 rounded-2xl border border-white/[0.07]">
            {[
              { id: 'orders', label: 'Orders & Payments', icon: LayoutGrid },
              { id: 'team', label: 'Team & Sequence Dashboard', icon: Users },
              { id: 'categories', label: 'Categories', icon: Tag },
            ].map(tab => {
              const Icon = tab.icon
              const active = ownerTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setOwnerTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition ios-press cursor-pointer ${
                    active ? 'bg-[#3A3A3C] text-white shadow' : 'text-white/55 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              )
            })}
          </div>

          {/* OWNER TAB 1: ORDERS & CLIENT PAYMENT TRACKING */}
          {ownerTab === 'orders' && (
            <div className="space-y-6">
              <form onSubmit={handleAddOrder} className="bg-[#1C1C1E] border border-white/[0.08] rounded-[24px] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#0A84FF]" /> New Order
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] bg-[#0A84FF]/15 text-[#0A84FF] px-3.5 py-1 rounded-full font-medium">
                      Company ID: <strong>{finalGeneratedTitle}</strong>
                    </span>
                    {previewEmployeeOrderCode && (
                      <span className="text-[12px] bg-[#30D158]/15 text-[#30D158] px-3.5 py-1 rounded-full font-medium">
                        Employee ID: <strong>{previewEmployeeOrderCode}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                    className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-white focus:outline-none focus:border-[#0A84FF]"
                  >
                    <option value="" disabled>Select Category *</option>
                    {myOwnCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>

                  <div className="md:col-span-2 flex items-center bg-[#2C2C2E] border border-white/[0.08] rounded-xl overflow-hidden focus-within:border-[#0A84FF]">
                    <span className="bg-white/[0.06] text-[#0A84FF] font-semibold text-[14px] px-3.5 py-2.5 select-none border-r border-white/10">
                      {autoBaseOrderName}
                    </span>
                    <input
                      type="text"
                      placeholder="Optional note (e.g. from CV_102)"
                      value={titleSuffix}
                      onChange={(e) => setTitleSuffix(e.target.value)}
                      className="flex-1 bg-transparent px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none"
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Client Name / WhatsApp"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#0A84FF]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#0A84FF]"
                  >
                    <option value="">Assign: Myself</option>
                    {myTeamMembers.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({getActiveWorkload(emp.id)} active)
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    placeholder="Client Fee (Rs.)"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#0A84FF]"
                  />

                  <select
                    value={clientPaymentStatus}
                    onChange={(e) => setClientPaymentStatus(e.target.value)}
                    className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#0A84FF]"
                  >
                    <option value="unpaid">Client: Unpaid</option>
                    <option value="half_paid">Client: Half Paid</option>
                    <option value="full_paid">Client: Full Paid</option>
                  </select>

                  <input
                    type="number"
                    placeholder="Staff Payout (Rs.)"
                    value={employeeFee}
                    onChange={(e) => setEmployeeFee(e.target.value)}
                    className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#0A84FF]"
                  />

                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#0A84FF]"
                  >
                    <option value="normal">Normal Priority</option>
                    <option value="urgent">Urgent Priority</option>
                    <option value="low">Low Priority</option>
                  </select>

                  <button
                    type="submit"
                    className="bg-[#0A84FF] hover:bg-[#409CFF] text-white font-semibold rounded-xl px-4 py-2.5 text-[13px] shadow-md ios-press cursor-pointer"
                  >
                    Save Order
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Instructions or requirements (optional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-2 text-[14px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-[#0A84FF]"
                />
              </form>

              {/* Search & Filter Bar */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search Company ID, Employee ID (e.g. CV_20) or client..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#0A84FF]"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#1C1C1E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white/85"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">In Review</option>
                  <option value="revision">Update Needed</option>
                  <option value="done">Completed</option>
                </select>

                <select
                  value={clientPayFilter}
                  onChange={(e) => setClientPayFilter(e.target.value)}
                  className="bg-[#1C1C1E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white/85"
                >
                  <option value="all">Client Pay: All</option>
                  <option value="unpaid">Client: Unpaid</option>
                  <option value="half_paid">Client: Half Paid</option>
                  <option value="full_paid">Client: Full Paid</option>
                </select>

                <select
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                  className="bg-[#1C1C1E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white/85"
                >
                  <option value="all">All Assignees</option>
                  <option value="me">Myself</option>
                  {myTeamMembers.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>

                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="bg-[#1C1C1E] border border-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white/85"
                >
                  <option value="all">Staff Pay: All</option>
                  <option value="unpaid">Staff: Unpaid</option>
                  <option value="paid">Staff: Paid</option>
                </select>
              </div>

              {/* Owner Orders List */}
              <div className="space-y-3">
                {filteredOwnerOrders.length === 0 ? (
                  <div className="text-center py-14 bg-[#1C1C1E]/60 border border-white/[0.06] rounded-[24px] text-white/40 text-[14px]">
                    No orders found.
                  </div>
                ) : (
                  filteredOwnerOrders.map(order => {
                    const category = categories.find(c => c.id === order.category_id)
                    const assignee = myTeamMembers.find(e => e.id === order.assigned_to)
                    const clientPayKey = order.client_payment_status || 'unpaid'
                    return (
                      <div
                        key={order.id}
                        className={`bg-[#1C1C1E] border rounded-[22px] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition ${
                          order.status === 'revision' ? 'border-[#FF453A]/50' : 'border-white/[0.07]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {order.priority === 'urgent' && (
                              <span className="text-[11px] font-semibold bg-[#FF453A]/15 text-[#FF453A] px-2.5 py-0.5 rounded-full">
                                Urgent
                              </span>
                            )}
                            {category && (
                              <span
                                className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
                                style={{ backgroundColor: `${category.color}22`, color: category.color }}
                              >
                                {category.name}
                              </span>
                            )}
                            <h3 className="font-semibold text-[16px] text-white">{order.title}</h3>
                            {assignee && order.employee_order_code && (
                              <span className="text-[11px] font-semibold bg-[#32ADE6]/15 text-[#32ADE6] border border-[#32ADE6]/25 px-2.5 py-0.5 rounded-full">
                                {assignee.name}: {order.employee_order_code}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-[13px] text-white/55">
                            {order.client_name && <span>Client: <strong className="text-white/90 font-medium">{order.client_name}</strong></span>}
                            {order.price > 0 && <span>Fee: <strong className="text-[#30D158] font-medium">Rs. {order.price}</strong></span>}
                            {order.employee_fee > 0 && <span>Staff Payout: <strong className="text-[#FF9F0A] font-medium">Rs. {order.employee_fee}</strong></span>}
                            {order.notes && <span className="italic text-white/45">“{order.notes}”</span>}
                          </div>

                          {order.revision_note && (
                            <div className="text-[12px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/20 rounded-xl px-3 py-1.5 inline-block">
                              Update Note: {order.revision_note}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Client Payment Toggle Pill */}
                          <button
                            onClick={() => cycleClientPaymentStatus(order)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-semibold border ios-press cursor-pointer ${CLIENT_PAYMENT_CONFIG[clientPayKey]?.color}`}
                            title="Click to switch: Client Unpaid → Half Paid → Full Paid"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            {CLIENT_PAYMENT_CONFIG[clientPayKey]?.label}
                          </button>

                          <select
                            value={order.assigned_to || ''}
                            onChange={(e) => updateOrderAssignee(order, e.target.value)}
                            className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3 py-1.5 text-[12px] text-white/90"
                          >
                            <option value="">Myself</option>
                            {myTeamMembers.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>

                          {order.assigned_to && (
                            <button
                              onClick={() => togglePaymentStatus(order)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-semibold border ios-press cursor-pointer ${
                                order.payment_status === 'paid'
                                  ? 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30'
                                  : 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30'
                              }`}
                              title="Toggle Staff Payout"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              {order.payment_status === 'paid' ? 'Staff Paid' : 'Pay Staff'}
                            </button>
                          )}

                          {order.assigned_to && (
                            <button
                              onClick={() => {
                                setRevisionModalOrder(order)
                                setRevisionNoteInput(order.revision_note || '')
                              }}
                              className="px-3 py-1.5 rounded-xl text-[12px] font-medium bg-[#FF453A]/15 text-[#FF453A] border border-[#FF453A]/25 hover:bg-[#FF453A]/25 ios-press cursor-pointer"
                            >
                              Request Update
                            </button>
                          )}

                          <select
                            value={order.status}
                            onChange={(e) => updateOrderStatus(order, e.target.value)}
                            className={`border rounded-xl px-3 py-1.5 text-[12px] font-semibold cursor-pointer ${STATUS_CONFIG[order.status]?.color}`}
                          >
                            <option value="pending" className="bg-[#1C1C1E] text-white">Pending</option>
                            <option value="in_progress" className="bg-[#1C1C1E] text-white">In Progress</option>
                            <option value="review" className="bg-[#1C1C1E] text-white">In Review</option>
                            <option value="revision" className="bg-[#1C1C1E] text-white">Update Needed</option>
                            <option value="done" className="bg-[#1C1C1E] text-white">Completed</option>
                          </select>

                          <button
                            onClick={() => deleteOrder(order.id)}
                            className="w-8 h-8 rounded-full hover:bg-[#FF453A]/15 text-white/40 hover:text-[#FF453A] flex items-center justify-center transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* OWNER TAB 2: TEAM & SEQUENCE DASHBOARD */}
          {ownerTab === 'team' && (
            <div className="space-y-6">
              <form onSubmit={handleAddEmployee} className="bg-[#1C1C1E] border border-white/[0.08] rounded-[24px] p-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Employee Name *"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  required
                  className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/35"
                />
                <input
                  type="email"
                  placeholder="Google Email *"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  required
                  className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/35"
                />
                <input
                  type="text"
                  placeholder="Role (e.g. Designer)"
                  value={empRole}
                  onChange={(e) => setEmpRole(e.target.value)}
                  className="bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/35"
                />
                <button
                  type="submit"
                  className="bg-[#0A84FF] hover:bg-[#409CFF] text-white font-semibold rounded-xl px-5 py-2.5 text-[14px] ios-press cursor-pointer"
                >
                  Add Member
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myTeamMembers.map(emp => {
                  const empOrders = myWorkspaceOrders.filter(o => o.assigned_to === emp.id)
                  const activeJobs = empOrders.filter(o => o.status !== 'done').length
                  const doneJobs = empOrders.filter(o => o.status === 'done').length
                  const unpaidBalance = empOrders
                    .filter(o => o.payment_status !== 'paid')
                    .reduce((sum, o) => sum + Number(o.employee_fee || 0), 0)
                  const paidTotal = empOrders
                    .filter(o => o.payment_status === 'paid')
                    .reduce((sum, o) => sum + Number(o.employee_fee || 0), 0)

                  const catStats = myOwnCategories.map(cat => {
                    const count = empOrders.filter(o => o.category_id === cat.id).length
                    const nextCode = getNextEmployeeCode(emp.id, cat.id)
                    return { cat, count, nextCode }
                  }).filter(item => item.count > 0)

                  const recentEmpOrders = empOrders.slice(0, 4)

                  return (
                    <div key={emp.id} className="bg-[#1C1C1E] border border-white/[0.08] rounded-[24px] p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-white text-[18px]">{emp.name}</h3>
                          <p className="text-[13px] text-white/50">{emp.role}</p>
                          <p className="text-[12px] text-[#0A84FF] mt-0.5">{emp.email}</p>
                        </div>
                        <button
                          onClick={() => deleteEmployee(emp.id)}
                          className="text-white/40 hover:text-[#FF453A] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="pt-3 border-t border-white/[0.08] grid grid-cols-2 gap-3 text-[13px]">
                        <div>
                          <span className="text-white/45 block text-[11px]">Workload</span>
                          <strong className="text-[#32ADE6]">{activeJobs} active</strong> · <span className="text-[#30D158]">{doneJobs} done</span>
                        </div>
                        <div>
                          <span className="text-white/45 block text-[11px]">Payments</span>
                          <strong className="text-[#FF9F0A]">Due: Rs. {unpaidBalance.toLocaleString()}</strong>
                          <span className="text-white/45 block text-[11px]">Paid: Rs. {paidTotal.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/[0.08] space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45 flex items-center gap-1">
                          <Hash className="w-3 h-3 text-[#32ADE6]" /> Category Order Sequences
                        </span>
                        {catStats.length === 0 ? (
                          <p className="text-[12px] text-white/35">No category orders assigned yet.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {catStats.map(({ cat, count, nextCode }) => (
                              <div
                                key={cat.id}
                                className="bg-[#2C2C2E] border border-white/[0.06] rounded-xl px-3 py-1.5 text-[12px] flex items-center gap-2"
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                <span className="text-white/80 font-medium">{cat.name}:</span>
                                <strong className="text-white">{count}</strong>
                                <span className="text-[11px] text-[#30D158] font-semibold">
                                  (Next: {nextCode})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {recentEmpOrders.length > 0 && (
                        <div className="pt-3 border-t border-white/[0.08] space-y-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45 block">
                            Recent Assigned Mapping
                          </span>
                          <div className="space-y-1">
                            {recentEmpOrders.map(o => (
                              <div key={o.id} className="flex items-center justify-between text-[12px] bg-black/30 rounded-lg px-2.5 py-1.5">
                                <span className="text-[#32ADE6] font-semibold">
                                  {o.employee_order_code || '—'}
                                </span>
                                <span className="text-white/50 truncate max-w-[200px]">
                                  Company: {o.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* OWNER TAB 3: CATEGORIES */}
          {ownerTab === 'categories' && (
            <div className="space-y-6">
              <form onSubmit={handleAddCategory} className="bg-[#1C1C1E] border border-white/[0.08] rounded-[24px] p-5 flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Category Name (e.g. Flyer, Logo) *"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                  className="flex-1 bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/35"
                />
                <div className="flex items-center gap-2 bg-[#2C2C2E] border border-white/[0.08] rounded-xl px-3.5 py-1.5">
                  <span className="text-[13px] text-white/55">Accent:</span>
                  <input
                    type="color"
                    value={catColor}
                    onChange={(e) => setCatColor(e.target.value)}
                    className="w-7 h-7 bg-transparent border-0 cursor-pointer"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-[#0A84FF] hover:bg-[#409CFF] text-white font-semibold rounded-xl px-5 py-2.5 text-[14px] ios-press cursor-pointer"
                >
                  Add Category
                </button>
              </form>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {myOwnCategories.map(cat => (
                  <div
                    key={cat.id}
                    className="bg-[#1C1C1E] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-[14px] font-medium text-white">{cat.name}</span>
                    </div>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="text-white/40 hover:text-[#FF453A] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* SECTION 2: SHARED ORDERS (EMPLOYEE WORKSPACE) */}
      {workspaceMode === 'shared_orders' && (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-7 space-y-6 animate-ios-spring">
          <div className="bg-[#1C1C1E] border border-white/[0.08] rounded-[24px] p-5 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#30D158]">
              Employer Companies
            </div>
            {employerCompanies.length === 0 ? (
              <p className="text-[14px] text-white/55">
                No companies have added <strong className="text-white">{userEmail}</strong> yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCompanyOwnerId('all')}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition ios-press cursor-pointer ${
                    selectedCompanyOwnerId === 'all'
                      ? 'bg-[#30D158] text-black'
                      : 'bg-[#2C2C2E] text-white/75 hover:text-white'
                  }`}
                >
                  All Companies ({employerCompanies.length})
                </button>
                {employerCompanies.map(comp => (
                  <button
                    key={comp.ownerId}
                    onClick={() => setSelectedCompanyOwnerId(comp.ownerId)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition ios-press cursor-pointer ${
                      selectedCompanyOwnerId === comp.ownerId
                        ? 'bg-[#30D158] text-black'
                        : 'bg-[#2C2C2E] text-white/75 hover:text-white'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    {comp.companyName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Active Tasks</div>
              <div className="text-[28px] font-bold tracking-tight text-white mt-0.5">
                {visibleSharedOrders.filter(o => o.status !== 'done').length}
              </div>
            </div>
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Completed Tasks</div>
              <div className="text-[28px] font-bold tracking-tight text-[#30D158] mt-0.5">{sharedCompletedOrders.length}</div>
            </div>
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Total Earned</div>
              <div className="text-[28px] font-bold tracking-tight text-[#32ADE6] mt-0.5">
                Rs. {sharedTotalEarned.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-[22px] p-4">
              <div className="text-white/50 text-[12px] font-medium">Payout Status</div>
              <div className="text-[15px] font-bold text-[#30D158] mt-1">Paid: Rs. {sharedPaidAmount.toLocaleString()}</div>
              <div className="text-[12px] text-[#FF9F0A]">Pending: Rs. {sharedPendingPayout.toLocaleString()}</div>
            </div>
          </div>

          {Object.keys(categoryBreakdown).length > 0 && (
            <div className="bg-[#1C1C1E] border border-white/[0.07] rounded-2xl p-4 flex flex-wrap items-center gap-2.5">
              <span className="text-[12px] font-semibold text-white/50 mr-1">Completed Breakdown:</span>
              {Object.entries(categoryBreakdown).map(([catName, count]) => (
                <span
                  key={catName}
                  className="text-[12px] font-semibold bg-[#30D158]/15 text-[#30D158] px-3.5 py-1 rounded-full"
                >
                  {catName} · {count}
                </span>
              ))}
            </div>
          )}

          {sharedRevisionOrders.length > 0 && (
            <div className="bg-[#FF453A]/15 border border-[#FF453A]/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#FF453A] shrink-0 mt-0.5" />
              <div className="text-[13px] space-y-0.5">
                <div className="font-semibold text-[#FF453A]">
                  {sharedRevisionOrders.length} order(s) require updates
                </div>
                <p className="text-white/75">
                  Review the highlighted orders below and update their status once completed.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-[15px] font-semibold text-white/80">Assigned Orders</h2>
            {visibleSharedOrders.length === 0 ? (
              <div className="text-center py-14 bg-[#1C1C1E]/60 border border-white/[0.06] rounded-[24px] text-white/40 text-[14px]">
                No shared orders found.
              </div>
            ) : (
              visibleSharedOrders.map(order => {
                const category = categories.find(c => c.id === order.category_id)
                const ownerProf = allProfiles.find(p => p.id === order.user_id)
                return (
                  <div
                    key={order.id}
                    className={`bg-[#1C1C1E] border rounded-[22px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                      order.status === 'revision'
                        ? 'border-[#FF453A]/50'
                        : order.status === 'done'
                        ? 'border-white/[0.04] opacity-75'
                        : 'border-white/[0.07]'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold bg-[#0A84FF]/15 text-[#0A84FF] px-2.5 py-0.5 rounded-full">
                          {ownerProf?.company_name || 'Company'}
                        </span>
                        {category && (
                          <span
                            className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${category.color}22`, color: category.color }}
                          >
                            {category.name}
                          </span>
                        )}
                        <h3 className="font-bold text-[17px] text-white">
                          {order.employee_order_code || order.title}
                        </h3>
                        {order.employee_order_code && (
                          <span className="text-[11px] font-medium bg-white/[0.06] text-white/55 px-2.5 py-0.5 rounded-full">
                            Company Ref: {order.title}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-[13px] text-white/55">
                        {order.client_name && <span>Client: <strong className="text-white/90 font-medium">{order.client_name}</strong></span>}
                        <span>Your Fee: <strong className="text-[#32ADE6] font-medium">Rs. {order.employee_fee || 0}</strong></span>
                        <span className={`font-semibold flex items-center gap-1 ${
                          order.payment_status === 'paid' ? 'text-[#30D158]' : 'text-[#FF9F0A]'
                        }`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {order.payment_status === 'paid' ? 'Paid' : 'Payment Pending'}
                        </span>
                      </div>

                      {order.notes && <p className="text-[13px] text-white/50 italic">“{order.notes}”</p>}

                      {order.revision_note && (
                        <div className="text-[12px] text-[#FF453A] bg-[#FF453A]/15 border border-[#FF453A]/25 rounded-xl px-3 py-1.5">
                          <strong>Update Request:</strong> {order.revision_note}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order, e.target.value)}
                        className={`border rounded-xl px-3 py-1.5 text-[12px] font-semibold cursor-pointer ${STATUS_CONFIG[order.status]?.color}`}
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

      {/* Update / Revision Modal */}
      {revisionModalOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSendRevision}
            className="bg-[#1C1C1E] border border-white/15 rounded-[28px] max-w-md w-full p-6 space-y-4 shadow-2xl animate-ios-pop"
          >
            <h3 className="text-[18px] font-bold text-white tracking-tight">
              Request Update · {revisionModalOrder.employee_order_code || revisionModalOrder.title}
            </h3>
            <p className="text-[13px] text-white/55">
              This marks the order as Update Needed and sends an instant alert to the assigned employee.
            </p>
            <textarea
              rows="3"
              required
              placeholder="Describe what needs to be changed..."
              value={revisionNoteInput}
              onChange={(e) => setRevisionNoteInput(e.target.value)}
              className="w-full bg-[#2C2C2E] border border-white/10 rounded-2xl p-3.5 text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#FF453A]"
            />
            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setRevisionModalOrder(null)}
                className="px-4 py-2.5 rounded-xl text-[13px] font-medium bg-[#2C2C2E] text-white/80 hover:text-white ios-press cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-[#FF453A] hover:bg-[#FF6961] text-white ios-press cursor-pointer"
              >
                Send Request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}