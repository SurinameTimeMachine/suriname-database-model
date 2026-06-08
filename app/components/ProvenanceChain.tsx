'use client';

import type { ProvenanceRecord } from '@/lib/types';

interface ProvenanceChainProps {
  record: ProvenanceRecord | null;
}

export default function ProvenanceChain({ record }: ProvenanceChainProps) {
  if (!record) return null;

  const steps = [
    { label: 'Source File', value: record.sourceFile, icon: 'file' },
    { label: 'Source Column', value: record.sourceColumn },
    { label: 'Source Row', value: record.sourceRow },
    { label: 'Transformed By', value: record.transformedBy, icon: 'code' },
    { label: 'Model Entity', value: record.modelEntity, icon: 'cube' },
    { label: 'Schema Table', value: record.schemaTable, icon: 'table' },
    { label: 'Linked Via', value: record.linkedVia, icon: 'link' },
  ].filter((s) => s.value);

  return (
    <div className="mt-2 mb-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-1.5">
            <div className="border border-ink/10 bg-cream px-2 py-0.5 text-xs">
              <span className="text-teal-strong font-medium">
                {step.label}:{' '}
              </span>
              <span className="text-ink/75 font-mono text-[11px]">
                {step.value}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="text-teal-strong/45">&#8594;</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
