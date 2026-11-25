import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import {
  Plus, Users, Tag, LogOut, Trash2, LayoutGrid, Search, Inbox
} from 'lucide-react'

const DEFAULT_CATEGORIES = [
  { name: 'CV Design', color: '#6366f1' },
  { name: 'Flyer', color: '#06b6d4' },
  { name: 'FB Post', color: '#3b82f6' },
  { name: 'Logo', color: '#f59e0b' },
]

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  in_progress: { label: 'In Progress', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  review: { label: 'Review', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  done: { label: 'Done', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const [orders, setOrders] = useState([])
  const [categories, setCategories] = useState([])
  const [employees, setEmployees] = useState([])

  // Tabs: 'orders' (My Workspace) | 'assigned' (Tasks Assigned to Me by Others) | 'team' | 'categories'
  const [activeTab, setActiveTab] = useState('orders')
  const [statusFilter, setStatusFilter] = useState('all')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Quick Add Order Form
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [price, setPrice] = useState('')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')

  // Add Employee Form
  const [empName, setEmpName] = useState('')
  const [empEmail, setEmpEmail] = useState('')
  const [empRole, setEmpRole] = useState('Designer')

  // Add Category Form
  const [catName, setCatName] = useState('')
  const [catColor, setCatColor] = useState('#6366f1')

  const userId = session?.user?.id

  const fetchCategories = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('categories').select('*').order('created_at', { ascending: true })
    if (data) {
      const myCategories = data.filter(c => c.user_id === userId)
      if (myCategories.length === 0) {
        const toInsert = DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: userId }))
        const { data: seeded } = await supabase.from('categories').insert(toInsert).select()
        if (seeded) setCategories([...data, ...seeded])
        return
      }
      setCategories(data)
    }
  }, [userId])

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('*').order('created_at', { ascending: true })
    if (data) setEmployees(data)
  }, [])

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setOrders(data)
  }, [])

  const fetchAllData = useCallback(async () => {
    await Promise.all([fetchCategories(), fetchEmployees(), fetchOrders()])
  }, [fetchCategories, fetchEmployees, fetchOrders])

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

  useEffect(() => {
    if (!userId) return

    let isMounted = true
    const initLoad = async () => {
      if (isMounted) await fetchAllData()
    }
    initLoad()

    const channel = supabase
      .channel('flowspace-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, fetchEmployees)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchCategories)
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [userId, fetchAllData, fetchOrders, fetchEmployees, fetchCategories])

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const handleAddOrder = async (e) => {
    e.preventDefault()
    if (!title.trim()) return

    const { error } = await supabase.from('orders').insert([{
      user_id: userId,
      title: title.trim(),
      client_name: clientName.trim() || null,
      category_id: categoryId || null,
      assigned_to: assignedTo || null,
      price: price ? parseFloat(price) : 0,
      priority,
      notes: notes.trim() || null,
      status: 'pending'
    }])

    if (!error) {
      setTitle('')
      setClientName('')
      setPrice('')
      setNotes('')
      setPriority('normal')
      fetchOrders()
    }
  }

  const updateOrderStatus = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id)
    fetchOrders()
  }

  const updateOrderAssignee = async (id, empId) => {
    await supabase.from('orders').update({ assigned_to: empId || null }).eq('id', id)
    fetchOrders()
  }

  const deleteOrder = async (id) => {
    await supabase.from('orders').delete().eq('id', id)
    fetchOrders()
  }

  const handleAddEmployee = async (e) => {
    e.preventDefault()
    if (!empName.trim()) return
    await supabase.from('employees').insert([{
      owner_id: userId,
      name: empName.trim(),
      email: empEmail.trim().toLowerCase() || null,
      role: empRole.trim() || 'Designer'
    }])
    setEmpName('')
    setEmpEmail('')
    fetchEmployees()
  }

  const deleteEmployee = async (id) => {
    await supabase.from('employees').delete().eq('id', id)
    fetchEmployees()
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    if (!catName.trim()) return
    await supabase.from('categories').insert([{
      user_id: userId,
      name: catName.trim(),
      color: catColor
    }])
    setCatName('')
    fetchCategories()
  }

  const deleteCategory = async (id) => {
    await supabase.from('categories').delete().eq('id', id)
    fetchCategories()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        Loading FlowSpace...
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <img src="/logo.svg" alt="FlowSpace Logo" className="w-16 h-16 mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to FlowSpace</h1>
          <p className="text-slate-400 text-sm mb-8">
            Replace messy notepads. Track client orders, assign tasks to your team, and balance your creative workload.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 px-4 rounded-xl transition cursor-pointer"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
            Continue with Google
          </button>
        </div>
      </div>
    )
  }

  // Separate: Orders I created vs Orders assigned to me by a Team Owner
  const myWorkspaceOrders = orders.filter(o => o.user_id === userId)
  const assignedToMeOrders = orders.filter(o => o.user_id !== userId)
  const myTeamMembers = employees.filter(e => e.owner_id === userId)
  const myOwnCategories = categories.filter(c => c.user_id === userId)

  const getActiveWorkload = (empId) =>
    myWorkspaceOrders.filter(o => o.assigned_to === empId && o.status !== 'done').length

  const filteredOrders = myWorkspaceOrders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (employeeFilter === 'me' && o.assigned_to !== null) return false
    if (employeeFilter !== 'all' && employeeFilter !== 'me' && o.assigned_to !== employeeFilter) return false
    if (searchQuery && !o.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !(o.client_name || '').toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const activeCount = myWorkspaceOrders.filter(o => o.status !== 'done').length
  const completedCount = myWorkspaceOrders.filter(o => o.status === 'done').length
  const pendingAssignedCount = assignedToMeOrders.filter(o => o.status !== 'done').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="FlowSpace" className="w-9 h-9" />
            <div>
              <span className="font-bold text-lg tracking-tight text-white">FlowSpace</span>
              <span className="ml-2 text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Workspace</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-sm text-slate-400">{session.user.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-xs font-medium">My Active Orders</div>
            <div className="text-2xl font-bold text-white mt-1">{activeCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-xs font-medium">Completed Orders</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{completedCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-xs font-medium">Assigned to Me (Team)</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{pendingAssignedCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-xs font-medium">My Team Members</div>
            <div className="text-2xl font-bold text-cyan-400 mt-1">{myTeamMembers.length}</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === 'orders' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> My Orders
          </button>

          <button
            onClick={() => setActiveTab('assigned')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === 'assigned' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Inbox className="w-4 h-4" /> Assigned to Me
            {pendingAssignedCount > 0 && (
              <span className="bg-amber-500 text-slate-950 text-xs font-bold px-1.5 py-0.2 rounded-full">
                {pendingAssignedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === 'team' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Team & Workload
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === 'categories' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Tag className="w-4 h-4" /> Categories
          </button>
        </div>

        {/* TAB 1: MY ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <form onSubmit={handleAddOrder} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" /> Quick Add Order / Task
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Task title (e.g. Modern CV for Kasun) *"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Client name / WhatsApp"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select Category</option>
                  {myOwnCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Assign: Myself</option>
                  {myTeamMembers.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({getActiveWorkload(emp.id)} active)
                    </option>
                  ))}
                </select>

                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="normal">Priority: Normal</option>
                  <option value="urgent">Priority: Urgent 🔥</option>
                  <option value="low">Priority: Low</option>
                </select>

                <input
                  type="number"
                  placeholder="Price (optional)"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />

                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl px-4 py-2.5 text-sm transition cursor-pointer"
                >
                  + Save Order
                </button>
              </div>

              <input
                type="text"
                placeholder="Notes / Requirements (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
              />
            </form>

            {/* Filters Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search orders or clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>

              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200"
              >
                <option value="all">All Assignees</option>
                <option value="me">Assigned to Me</option>
                {myTeamMembers.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            {/* Orders List */}
            <div className="space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/50 border border-slate-800/60 rounded-2xl text-slate-500 text-sm">
                  No orders found. Add your first task above!
                </div>
              ) : (
                filteredOrders.map(order => {
                  const category = categories.find(c => c.id === order.category_id)
                  return (
                    <div
                      key={order.id}
                      className={`bg-slate-900 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                        order.status === 'done' ? 'border-slate-800/50 opacity-60' : 'border-slate-800'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {order.priority === 'urgent' && (
                            <span className="text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-md">
                              URGENT
                            </span>
                          )}
                          {category && (
                            <span
                              className="text-xs font-medium px-2.5 py-0.5 rounded-md"
                              style={{ backgroundColor: `${category.color}20`, color: category.color }}
                            >
                              {category.name}
                            </span>
                          )}
                          <h3 className={`font-semibold text-base ${order.status === 'done' ? 'line-through text-slate-400' : 'text-white'}`}>
                            {order.title}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          {order.client_name && <span>Client: <strong className="text-slate-300">{order.client_name}</strong></span>}
                          {order.price > 0 && <span>Fee: <strong className="text-emerald-400">Rs. {order.price}</strong></span>}
                          {order.notes && <span className="text-slate-400 italic">"{order.notes}"</span>}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={order.assigned_to || ''}
                          onChange={(e) => updateOrderAssignee(order.id, e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
                        >
                          <option value="">👤 Myself</option>
                          {myTeamMembers.map(emp => (
                            <option key={emp.id} value={emp.id}>👥 {emp.name}</option>
                          ))}
                        </select>

                        <select
                          value={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer ${STATUS_CONFIG[order.status]?.color}`}
                        >
                          <option value="pending" className="bg-slate-900 text-white">Pending</option>
                          <option value="in_progress" className="bg-slate-900 text-white">In Progress</option>
                          <option value="review" className="bg-slate-900 text-white">Review</option>
                          <option value="done" className="bg-slate-900 text-white">Done</option>
                        </select>

                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                          title="Delete Order"
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

        {/* TAB 2: ASSIGNED TO ME (EMPLOYEE VIEW) */}
        {activeTab === 'assigned' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Tasks assigned to <strong className="text-slate-200">{session.user.email}</strong> by team owners appear here automatically.
            </p>
            {assignedToMeOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/50 border border-slate-800/60 rounded-2xl text-slate-500 text-sm">
                No tasks assigned to your email yet.
              </div>
            ) : (
              assignedToMeOrders.map(order => {
                const category = categories.find(c => c.id === order.category_id)
                return (
                  <div
                    key={order.id}
                    className={`bg-slate-900 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      order.status === 'done' ? 'border-slate-800/50 opacity-60' : 'border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {order.priority === 'urgent' && (
                          <span className="text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-md">
                            URGENT
                          </span>
                        )}
                        {category && (
                          <span
                            className="text-xs font-medium px-2.5 py-0.5 rounded-md"
                            style={{ backgroundColor: `${category.color}20`, color: category.color }}
                          >
                            {category.name}
                          </span>
                        )}
                        <h3 className={`font-semibold text-base ${order.status === 'done' ? 'line-through text-slate-400' : 'text-white'}`}>
                          {order.title}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        {order.client_name && <span>Client: <strong className="text-slate-300">{order.client_name}</strong></span>}
                        {order.notes && <span className="text-slate-400 italic">"{order.notes}"</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        className={`border rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${STATUS_CONFIG[order.status]?.color}`}
                      >
                        <option value="pending" className="bg-slate-900 text-white">Pending</option>
                        <option value="in_progress" className="bg-slate-900 text-white">In Progress</option>
                        <option value="review" className="bg-slate-900 text-white">Review</option>
                        <option value="done" className="bg-slate-900 text-white">Done</option>
                      </select>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* TAB 3: TEAM & WORKLOAD */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            <form onSubmit={handleAddEmployee} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Employee Name *"
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                required
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="email"
                placeholder="Google Email (for login sync) *"
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
                required
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="text"
                placeholder="Role (e.g. Graphic Designer)"
                value={empRole}
                onChange={(e) => setEmpRole(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl px-5 py-2.5 text-sm cursor-pointer"
              >
                + Add Member
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {myTeamMembers.map(emp => {
                const activeJobs = getActiveWorkload(emp.id)
                const doneJobs = myWorkspaceOrders.filter(o => o.assigned_to === emp.id && o.status === 'done').length
                return (
                  <div key={emp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-white text-base">{emp.name}</h3>
                        <p className="text-xs text-slate-400">{emp.role}</p>
                        {emp.email && <p className="text-xs text-indigo-400 mt-0.5">{emp.email}</p>}
                      </div>
                      <button
                        onClick={() => deleteEmployee(emp.id)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        Active Workload: <strong className={activeJobs > 3 ? 'text-rose-400' : 'text-cyan-400'}>{activeJobs} tasks</strong>
                      </span>
                      <span className="text-emerald-400">{doneJobs} done</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 4: CATEGORIES */}
        {activeTab === 'categories' && (
          <div className="space-y-6">
            <form onSubmit={handleAddCategory} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Category Name (e.g. YouTube Thumbnail, Banner) *"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <span className="text-xs text-slate-400">Badge Color:</span>
                <input
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="w-7 h-7 bg-transparent border-0 cursor-pointer"
                />
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl px-5 py-2.5 text-sm cursor-pointer"
              >
                + Add Category
              </button>
            </form>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {myOwnCategories.map(cat => (
                <div
                  key={cat.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium text-white">{cat.name}</span>
                  </div>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}