import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Field, Modal, inputClass } from './ui.js';
import { submitFeedback } from '../api/queries.js';

export function FeedbackLauncher() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      submitFeedback({
        message,
        pageUrl:
          typeof window === 'undefined' ? undefined : window.location.href,
      }),
    onSuccess: () => {
      setSent(true);
      setMessage('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const close = () => {
    setOpen(false);
    setError(null);
    setSent(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] uppercase tracking-wider text-ink-200 hover:text-brand-300"
      >
        [ feedback ]
      </button>
      <Modal open={open} onClose={close} title="Send feedback">
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Thanks! Your feedback has been sent.
            </p>
            <div className="flex justify-end">
              <Button onClick={close}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="What's on your mind?">
              <textarea
                className={`${inputClass} min-h-[120px]`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Bug, feature idea, confusing flow…"
              />
            </Field>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={!message.trim() || submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
