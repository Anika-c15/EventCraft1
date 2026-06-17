import React, { useState, useEffect } from 'react'
import {
  Users, Mail, CheckCircle2, Trash2, Calendar, Settings as SettingsIcon, Info, Plus, ChevronRight, User, Lock, AlertCircle
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { eventsApi } from '../api/client'
import { useAppContext } from '../context/AppContext'
import { useToast, useConfirm } from '../context/ToastAndConfirmContext'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const Settings: React.FC = () => {
  const { 
    eventId, 
    token, 
    user, 
    eventsList, 
    setEventId, 
    createEvent, 
    deleteEvent,
    loadEventsList
  } = useAppContext()
  
  const toast = useToast()
  const confirm = useConfirm()

  const [activeTab, setActiveTab] = useState<'general' | 'committee' | 'events'>('general')
  const [eventDetails, setEventDetails] = useState<any>(null)
  const [invites, setInvites] = useState<any[]>([])
  
  // Event Name Edit State
  const [editEventName, setEditEventName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const isNameLocked = eventDetails?.is_name_edited === true

  // Description Edit State
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editDescValue, setEditDescValue] = useState('')
  const [saveDescLoading, setSaveDescLoading] = useState(false)

  // New Event Form State
  const [newEventName, setNewEventName] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Committee Invite Form State
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  
  const [loading, setLoading] = useState(false)
  const isOwner = eventDetails && user && eventDetails.owner_id === user.id

  const loadEventDetails = async (targetId: string) => {
    try {
      const data = await eventsApi.get(targetId)
      setEventDetails(data)
      setEditDescValue(data.description || '')
      setEditEventName(data.name || '')
    } catch (err: any) {
      console.error(err)
    }
  }

  const loadInvites = async (targetId: string) => {
    if (!token) return
    try {
      const res = await fetch(`${BASE_URL}/api/events/${targetId}/invites`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setInvites(await res.json())
      }
    } catch (err) {
      console.error(err)
    }
  }

  const loadAll = async (targetId: string) => {
    setLoading(true)
    await Promise.all([loadEventDetails(targetId), loadInvites(targetId), loadEventsList()])
    setLoading(false)
  }

  useEffect(() => {
    if (eventId) {
      loadAll(eventId)
    }
  }, [eventId])

  const handleUpdateName = async () => {
    if (!eventId || !editEventName.trim() || editEventName === eventDetails.name) return
    
    const isConfirmed = await confirm({
      title: "Change Event Name?",
      message: "Are you sure? For security and link stability, you can only change the event name ONE time. It will be permanently locked after this.",
    })
    
    if (!isConfirmed) return

    setIsSavingName(true)
    try {
      const res = await fetch(`${BASE_URL}/api/events/${eventId}/name`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: editEventName.trim() })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Failed to update name")
      }
      
      const updated = await res.json()
      setEventDetails(updated)
      toast.success("Event name updated and permanently locked!")
      await loadEventsList() // Refresh sidebar list instantly
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSavingName(false)
    }
  }

  const handleSaveDescription = async () => {
    if (!eventId) return
    setSaveDescLoading(true)
    try {
      const updated = await eventsApi.update(eventId, { description: editDescValue })
      setEventDetails(updated)
      setEditDescValue(updated.description || '')
      setIsEditingDesc(false)
      toast.success('Description updated successfully!')
      await loadEventsList()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update description')
    } finally {
      setSaveDescLoading(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail || !eventId) return
    setInviteLoading(true)
    setInviteError('')
    try {
      const res = await fetch(`${BASE_URL}/api/events/${eventId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail })
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Failed to send invite')
      }
      setInviteEmail('')
      toast.success('Invitation sent successfully!')
      await loadInvites(eventId)
    } catch (e: any) {
      setInviteError(e.message)
      toast.error(e.message || 'Failed to send invite')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRemoveInvite = async (inviteId: string, email: string) => {
    if (!eventId) return
    const isConfirmed = await confirm({
      title: 'Revoke Invitation?',
      message: `Are you sure you want to revoke the invitation for ${email}?`,
    })
    if (!isConfirmed) return

    try {
      const res = await fetch(`${BASE_URL}/api/events/${eventId}/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        toast.success('Invitation revoked successfully.')
        await loadInvites(eventId)
      } else {
        throw new Error('Failed to revoke invitation')
      }
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEventName) return
    setCreateLoading(true)
    try {
      const newEvent = await createEvent(newEventName, newEventDesc)
      toast.success(`Event "${newEvent.name}" created successfully!`)
      setNewEventName('')
      setNewEventDesc('')
      setActiveTab('general')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create event')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSwitchEvent = async (id: string, name: string) => {
    setEventId(id)
    toast.success(`Switched active event to "${name}"`)
  }

  const handleDeleteEvent = async (id: string, name: string) => {
    const isConfirmed = await confirm({
      title: 'Delete Event?',
      message: `Are you sure you want to permanently delete event "${name}"? This action cannot be undone.`,
    })
    if (!isConfirmed) return

    try {
      await deleteEvent(id)
      toast.success(`Event "${name}" deleted successfully.`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete event')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          Configure event details, manage co-administrator access, and handle workspaces.
        </p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-gray-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'general'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Info size={16} />
          General Info
        </button>
        <button
          onClick={() => setActiveTab('committee')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'committee'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Users size={16} />
          Committee & Co-Admins
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'events'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <SettingsIcon size={16} />
          Event Management
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading settings...</div>
      ) : (
        <div className="space-y-6">
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Event Info Card */}
              <div className="lg:col-span-2">
                <Card>
                  <div className="p-2 space-y-6">
                    <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/25 text-primary flex items-center justify-center">
                        <SettingsIcon size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-base">Event Information</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Basic details for the current active event.</p>
                      </div>
                    </div>

                    {eventDetails ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        
                {/* NAME LOCK SECTION */}
<div className="md:col-span-2 space-y-2">
  <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
    Event Name
  </span>
  <div className="flex gap-2">
    <input
      type="text"
      value={editEventName}
      onChange={(e) => setEditEventName(e.target.value)}
      // Lock input if it's already edited or if the user isn't the owner
      disabled={isNameLocked || !isOwner}
      className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${
        isNameLocked || !isOwner
          ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-400' 
          : 'bg-white border-gray-300 text-gray-900 dark:bg-slate-950 dark:border-slate-700 dark:text-white'
      }`}
    />
    
    {/* STRICT REMOVAL: Only render the button if it is NOT locked */}
    {isOwner && !isNameLocked && (
      <Button
        variant="primary"
        onClick={handleUpdateName}
        disabled={isSavingName || editEventName === eventDetails.name}
        className="px-6 rounded-xl font-bold shadow-md transition-all"
      >
        {isSavingName ? 'Saving...' : 'Save Name'}
      </Button>
    )}
  </div>
  
  {/* Conditional Status Messages */}
  {isOwner && !isNameLocked && (
      <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 p-2.5 rounded-lg border border-orange-100 dark:border-orange-900/30">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <span>You may only change the event name <strong>one time</strong>. After saving, it will be permanently locked.</span>
      </div>
  )}
  {isNameLocked && (
      <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-slate-700/50">
        <Lock size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
        <span>This event name is locked.</span>
      </div>
  )}
</div>
{/* END NAME LOCK SECTION */}

                        <div>
                          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Event ID
                          </span>
                          <p className="text-sm font-mono text-gray-500 dark:text-slate-400 bg-gray-50/50 dark:bg-slate-900/40 border border-gray-150 dark:border-slate-800 rounded-xl px-4 py-3 select-all truncate">
                            {eventDetails.id}
                          </p>
                        </div>

                        <div>
                          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Current Stage
                          </span>
                          <div className="flex items-center gap-2 bg-gray-50/50 dark:bg-slate-900/40 border border-gray-150 dark:border-slate-800 rounded-xl px-4 py-2.5">
                            <Badge variant="primary">
                              {eventDetails.current_stage || 'Unknown'}
                            </Badge>
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                              Description
                            </span>
                            {!isEditingDesc && isOwner && (
                              <button
                                onClick={() => setIsEditingDesc(true)}
                                className="text-xs font-bold text-primary hover:underline cursor-pointer"
                              >
                                Edit Description
                              </button>
                            )}
                          </div>
                          {isEditingDesc ? (
                            <div className="space-y-2">
                              <textarea
                                value={editDescValue}
                                onChange={(e) => setEditDescValue(e.target.value)}
                                rows={3}
                                className="w-full text-sm text-gray-800 dark:text-slate-200 bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setIsEditingDesc(false)
                                    setEditDescValue(eventDetails?.description || '')
                                  }}
                                  className="text-xs font-bold"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={handleSaveDescription}
                                  disabled={saveDescLoading}
                                  className="text-xs font-bold"
                                >
                                  {saveDescLoading ? 'Saving...' : 'Save'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-600 dark:text-slate-350 bg-gray-50/50 dark:bg-slate-900/40 border border-gray-150 dark:border-slate-800 rounded-xl px-4 py-3 whitespace-pre-wrap min-h-[80px]">
                              {eventDetails.description || 'No description provided.'}
                            </p>
                          )}
                        </div>

                        <div>
                          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Created At
                          </span>
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-350 bg-gray-50/50 dark:bg-slate-900/40 border border-gray-150 dark:border-slate-800 rounded-xl px-4 py-3">
                            <Calendar size={16} className="text-gray-400" />
                            <span>
                              {eventDetails.created_at
                                ? new Date(eventDetails.created_at).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Unknown'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Created By
                          </span>
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-350 bg-gray-50/50 dark:bg-slate-900/40 border border-gray-150 dark:border-slate-800 rounded-xl px-4 py-3">
                            <User size={16} className="text-gray-400" />
                            <span>
                              {eventDetails.owner_name || 'System'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 py-4">No event details available.</p>
                    )}
                  </div>
                </Card>
              </div>

              {/* Admin Profile Card */}
              <div className="lg:col-span-1">
                <Card>
                  <div className="p-2 space-y-6">
                    <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/25 text-primary flex items-center justify-center">
                        <User size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-base">Your Profile</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Personal administrator details.</p>
                      </div>
                    </div>

                    {user ? (
                      <div className="space-y-4 pt-2">
                        <div>
                          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Name
                          </span>
                          <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 bg-gray-50/50 dark:bg-slate-900/40 border border-gray-150 dark:border-slate-800 rounded-xl px-4 py-3">
                            {user.name}
                          </p>
                        </div>

                        <div>
                          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Email Address
                          </span>
                          <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 bg-gray-50/50 dark:bg-slate-900/40 border border-gray-150 dark:border-slate-800 rounded-xl px-4 py-3 truncate">
                            {user.email}
                          </p>
                        </div>

                        <div>
                          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            System Role
                          </span>
                          <div className="inline-block">
                            <Badge variant="success">
                              {user.role === 'admin' ? 'Super Admin' : user.role === 'committee' ? 'Committee Member' : user.role}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 py-4">No profile details available.</p>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'committee' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Committee Members List */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <div className="p-2 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-4">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-base">Active & Invited Admins</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">People with administrative access to this event.</p>
                      </div>
                      <Badge variant="gray">{invites.length} Total</Badge>
                    </div>

                    <div className="divide-y divide-gray-100 dark:divide-slate-800 space-y-2">
                      {invites.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">No co-admins invited yet.</p>
                      ) : (
                        invites.map((inv: any) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-gray-50/50 dark:hover:bg-slate-800/20 group transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center text-xs font-bold text-primary">
                                {inv.email.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">
                                  {inv.email}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Mail size={12} className="text-gray-400" />
                                  <span className="text-xs text-gray-400">Invited Co-Admin</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {inv.is_accepted ? (
                                <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle2 size={10} /> Active
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-950/30 px-2 py-0.5 rounded-full">
                                  Pending
                                </span>
                              )}

                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInvite(inv.id, inv.email)}
                                  className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                                  title="Revoke invitation"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Invite Form Card */}
              <div className="space-y-4">
                <Card>
                  <div className="p-2 space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-gray-100 dark:border-slate-800 pb-4">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-primary flex items-center justify-center">
                        <Mail size={16} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Invite Co-Admin</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Add team members via email.</p>
                      </div>
                    </div>

                    {isOwner ? (
                      <form onSubmit={handleInvite} className="space-y-4 pt-1">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                            Email Address
                          </label>
                          <input
                            type="email"
                            placeholder="colleague@email.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="w-full border border-gray-200 dark:border-slate-700 bg-transparent dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            required
                          />
                        </div>

                        {inviteError && (
                          <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/25 border border-red-100 dark:border-red-900/35 rounded-lg px-2.5 py-2">
                            {inviteError}
                          </p>
                        )}

                        <Button
                          type="submit"
                          variant="primary"
                          className="w-full py-2.5 text-sm font-semibold rounded-xl"
                          disabled={inviteLoading || !inviteEmail}
                        >
                          {inviteLoading ? 'Sending Invitation...' : 'Send Invitation'}
                        </Button>
                      </form>
                    ) : (
                      <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl p-4 leading-relaxed">
                        ⚠️ Only the administrator who created this event workspace can invite other co-administrators or revoke pending invitations.
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Events Switcher List */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <div className="p-2 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-4">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-base">Your Events</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Switch active workspaces or delete old events.</p>
                      </div>
                      <Badge variant="gray">{eventsList.length} total</Badge>
                    </div>

                    <div className="divide-y divide-gray-100 dark:divide-slate-800 space-y-2">
                      {eventsList.map((e: any) => {
                        const isCurrent = e.id === eventId
                        return (
                          <div
                            key={e.id}
                            className={`flex items-center justify-between py-3 px-3 rounded-xl transition-all ${
                              isCurrent
                                ? 'bg-orange-50/50 dark:bg-orange-950/20 border border-orange-100/50 dark:border-orange-900/30'
                                : 'hover:bg-gray-50/50 dark:hover:bg-slate-800/20 border border-transparent'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold truncate ${isCurrent ? 'text-primary dark:text-primary-400' : 'text-gray-800 dark:text-slate-200'}`}>
                                  {e.name}
                                </span>
                                {isCurrent && (
                                  <Badge variant="primary">Current Active</Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-sm mt-0.5">
                                {e.description || 'No description provided.'}
                              </p>
                            </div>

                            <div className="flex items-center gap-2.5 flex-shrink-0">
                              {!isCurrent && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleSwitchEvent(e.id, e.name)}
                                  className="text-xs font-bold hover:border-primary/50 text-gray-700 dark:text-slate-350"
                                >
                                  Switch Workspace <ChevronRight size={13} />
                                </Button>
                              )}

                              {(user?.role === 'admin' || user?.role === 'committee') && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEvent(e.id, e.name)}
                                  className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                                  title="Delete event workspace"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Create New Event Card */}
              <div className="space-y-4">
                <Card>
                  <div className="p-2 space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-gray-100 dark:border-slate-800 pb-4">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-primary flex items-center justify-center">
                        <Plus size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Create New Event</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Spin up a brand new event instance.</p>
                      </div>
                    </div>

                    <form onSubmit={handleCreateEvent} className="space-y-4 pt-1">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                          Event Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. AI Autumn Hackathon"
                          value={newEventName}
                          onChange={(e) => setNewEventName(e.target.value)}
                          className="w-full border border-gray-200 dark:border-slate-700 bg-transparent dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                          Description
                        </label>
                        <textarea
                          placeholder="Short tagline or details..."
                          value={newEventDesc}
                          onChange={(e) => setNewEventDesc(e.target.value)}
                          rows={3}
                          className="w-full border border-gray-200 dark:border-slate-700 bg-transparent dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        className="w-full py-2.5 text-sm font-semibold rounded-xl"
                        disabled={createLoading || !newEventName}
                      >
                        {createLoading ? 'Creating Event...' : 'Create & Switch Workspace'}
                      </Button>
                    </form>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}