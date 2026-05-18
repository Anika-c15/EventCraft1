import React from 'react'
import { CheckCircle, Circle, Clock, Users, ClipboardList, Trophy, GitBranch, UserPlus } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import type { StageStatus } from '../types'

interface PipelineStageData {
  id: string
  name: string
  description: string
  status: StageStatus
  icon: React.ReactNode
  completedAt?: string
  startedAt?: string
  tasks: string[]
}

const stages: PipelineStageData[] = [
  {
    id: 's1',
    name: 'Participant Intake',
    description: 'Register and verify all participants, collect skill declarations and institutional affiliations.',
    status: 'completed',
    icon: <UserPlus size={20} />,
    completedAt: '2026-05-14T18:30:00Z',
    tasks: [
      'Open registration portal',
      'Collect participant profiles',
      'Verify institutional affiliations',
      'Approve participant roster',
    ],
  },
  {
    id: 's2',
    name: 'Team Formation',
    description: 'AI-powered team formation based on skill complementarity, institution diversity, and experience levels.',
    status: 'active',
    icon: <Users size={20} />,
    startedAt: '2026-05-15T09:00:00Z',
    tasks: [
      'Configure formation rules',
      'Run AI team formation algorithm',
      'Review proposed teams',
      'Approve team compositions',
    ],
  },
  {
    id: 's3',
    name: 'Evaluation',
    description: 'Judges evaluate team projects across innovation, execution, presentation, and impact dimensions.',
    status: 'pending',
    icon: <ClipboardList size={20} />,
    tasks: [
      'Open evaluation portal',
      'Collect judge scores',
      'Aggregate and normalize scores',
      'Flag anomalies for review',
    ],
  },
  {
    id: 's4',
    name: 'Results',
    description: 'Compile final rankings, generate certificates, and prepare announcement materials.',
    status: 'pending',
    icon: <Trophy size={20} />,
    tasks: [
      'Calculate final rankings',
      'Generate result reports',
      'Prepare certificates',
      'Draft announcement communications',
    ],
  },
  {
    id: 's5',
    name: 'Progression',
    description: 'Advance qualifying participants and teams to the next round or final event.',
    status: 'pending',
    icon: <GitBranch size={20} />,
    tasks: [
      'Identify qualifying teams',
      'Send progression notifications',
      'Update participant statuses',
      'Archive event data',
    ],
  },
]

const formatDate = (iso?: string) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const Pipeline: React.FC = () => {
  const completedCount = stages.filter((s) => s.status === 'completed').length
  const activeStage = stages.find((s) => s.status === 'active')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {completedCount} of {stages.length} stages completed
          </p>
        </div>
        {activeStage && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700">
              Active: {activeStage.name}
            </span>
          </div>
        )}
      </div>

      {/* Visual Pipeline */}
      <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
        {stages.map((stage, idx) => (
          <React.Fragment key={stage.id}>
            <div className="flex flex-col items-center min-w-[120px]">
              {/* Icon Circle */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                  stage.status === 'completed'
                    ? 'bg-green-500 border-green-500 text-white'
                    : stage.status === 'active'
                    ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30'
                    : 'bg-white border-gray-200 text-gray-400'
                }`}
              >
                {stage.status === 'completed' ? (
                  <CheckCircle size={22} />
                ) : stage.status === 'active' ? (
                  stage.icon
                ) : (
                  <Circle size={22} />
                )}
              </div>
              {/* Label */}
              <div className="mt-2 text-center">
                <p
                  className={`text-xs font-semibold ${
                    stage.status === 'active'
                      ? 'text-primary'
                      : stage.status === 'completed'
                      ? 'text-green-600'
                      : 'text-gray-400'
                  }`}
                >
                  {stage.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {stage.status === 'completed'
                    ? formatDate(stage.completedAt)
                    : stage.status === 'active'
                    ? 'In Progress'
                    : 'Pending'}
                </p>
              </div>
            </div>
            {idx < stages.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 min-w-[30px] ${
                  stages[idx + 1].status !== 'pending' || stage.status === 'completed'
                    ? 'bg-green-300'
                    : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Stage Detail Cards */}
      <div className="space-y-4">
        {stages.map((stage) => (
          <Card
            key={stage.id}
            className={`border-l-4 ${
              stage.status === 'completed'
                ? 'border-l-green-500'
                : stage.status === 'active'
                ? 'border-l-primary'
                : 'border-l-gray-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4 flex-1">
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    stage.status === 'completed'
                      ? 'bg-green-50 text-green-600'
                      : stage.status === 'active'
                      ? 'bg-orange-50 text-primary'
                      : 'bg-gray-50 text-gray-400'
                  }`}
                >
                  {stage.icon}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{stage.name}</h3>
                    <Badge
                      variant={
                        stage.status === 'completed'
                          ? 'success'
                          : stage.status === 'active'
                          ? 'primary'
                          : 'gray'
                      }
                    >
                      {stage.status === 'completed'
                        ? 'Completed'
                        : stage.status === 'active'
                        ? 'Active'
                        : 'Pending'}
                    </Badge>
                    {stage.status === 'active' && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{stage.description}</p>

                  {/* Tasks */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {stage.tasks.map((task, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {stage.status === 'completed' ? (
                          <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                        ) : stage.status === 'active' && i === 0 ? (
                          <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                        ) : stage.status === 'active' && i === 1 ? (
                          <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                        ) : stage.status === 'active' ? (
                          <Clock size={13} className="text-yellow-500 flex-shrink-0" />
                        ) : (
                          <Circle size={13} className="text-gray-300 flex-shrink-0" />
                        )}
                        <span
                          className={`text-xs ${
                            stage.status === 'completed' ||
                            (stage.status === 'active' && i < 2)
                              ? 'text-gray-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {task}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date */}
              <div className="text-right ml-4 flex-shrink-0">
                {stage.completedAt && (
                  <div>
                    <p className="text-xs text-gray-400">Completed</p>
                    <p className="text-xs font-medium text-gray-600">
                      {formatDate(stage.completedAt)}
                    </p>
                  </div>
                )}
                {stage.startedAt && (
                  <div>
                    <p className="text-xs text-gray-400">Started</p>
                    <p className="text-xs font-medium text-gray-600">
                      {formatDate(stage.startedAt)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Progress Summary */}
      <div className="mt-6 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Overall Progress</h3>
          <span className="text-sm font-bold text-primary">
            {Math.round((completedCount / stages.length) * 100)}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-primary h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / stages.length) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>{completedCount} completed</span>
          <span>{stages.length - completedCount} remaining</span>
        </div>
      </div>
    </div>
  )
}
