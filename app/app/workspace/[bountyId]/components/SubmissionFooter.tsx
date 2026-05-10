import { Loader2 } from 'lucide-react';

interface Props {
  canSubmit: boolean;
  submitting: boolean;
  submitSuccess: boolean;
  onSubmit: () => void;
}

export default function SubmissionFooter({ canSubmit, submitting, submitSuccess, onSubmit }: Props) {
  return (
    <div className="mt-8 flex justify-end items-center gap-4">
      {submitSuccess && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-5 py-3 rounded-xl">
          Translation submitted — awaiting validator review.
        </p>
      )}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="flex items-center gap-2 px-8 py-4 bg-ink text-parchment rounded-2xl font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {submitting ? (
          <><Loader2 size={18} className="animate-spin" /> Submitting…</>
        ) : (
          'Submit Translation'
        )}
      </button>
    </div>
  );
}
