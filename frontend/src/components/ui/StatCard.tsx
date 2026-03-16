import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export default function StatCard({ label, value, change, changeType = 'neutral', icon, className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-surface-200 bg-white p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-surface-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-surface-900">{value}</p>
          {change && (
            <p className={cn(
              'mt-1 text-2xs font-medium',
              changeType === 'positive' && 'text-green-600',
              changeType === 'negative' && 'text-red-600',
              changeType === 'neutral' && 'text-surface-400',
            )}>
              {changeType === 'positive' && '↑ '}
              {changeType === 'negative' && '↓ '}
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
