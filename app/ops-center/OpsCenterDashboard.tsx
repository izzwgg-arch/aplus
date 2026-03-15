'use client'

import { useState } from 'react'
import { OverviewTab } from './tabs/OverviewTab'
import { HealthTab } from './tabs/HealthTab'
import { SecurityTab } from './tabs/SecurityTab'
import { AlertsTab } from './tabs/AlertsTab'
import { UpdatesTab } from './tabs/UpdatesTab'
import { BackupsTab } from './tabs/BackupsTab'
import { ServicesTab } from './tabs/ServicesTab'
import { IPControlTab } from './tabs/IPControlTab'
import { SettingsTab } from './tabs/SettingsTab'
import { AuditHistoryTab } from './tabs/AuditHistoryTab'
import { IntrusionTimelineTab } from './tabs/IntrusionTimelineTab'
import { SystemMetricsTab } from './tabs/SystemMetricsTab'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'health', label: 'Health', icon: '❤️' },
  { id: 'security', label: 'Security', icon: '🔒' },
  { id: 'alerts', label: 'Alerts', icon: '🚨' },
  { id: 'updates', label: 'Updates', icon: '⬆️' },
  { id: 'backups', label: 'Backups', icon: '💾' },
  { id: 'services', label: 'Services', icon: '⚙️' },
  { id: 'ip-control', label: 'IP Control', icon: '🛡️' },
  { id: 'settings', label: 'Settings', icon: '🔧' },
  { id: 'audit', label: 'Audit History', icon: '📋' },
  { id: 'intrusion', label: 'Intrusion', icon: '⚠️' },
  { id: 'metrics', label: 'Metrics', icon: '📈' },
]

export function OpsCenterDashboard() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Tab Bar */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex space-x-0 min-w-max px-2" aria-label="Ops Center Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center space-x-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-purple-600 text-purple-700 bg-purple-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'health' && <HealthTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'alerts' && <AlertsTab />}
        {activeTab === 'updates' && <UpdatesTab />}
        {activeTab === 'backups' && <BackupsTab />}
        {activeTab === 'services' && <ServicesTab />}
        {activeTab === 'ip-control' && <IPControlTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'audit' && <AuditHistoryTab />}
        {activeTab === 'intrusion' && <IntrusionTimelineTab />}
        {activeTab === 'metrics' && <SystemMetricsTab />}
      </div>
    </div>
  )
}
