import { useEffect, useState, type FormEvent } from 'react';
import { FiEdit2, FiPlus } from 'react-icons/fi';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, inputClass } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { surveyService } from '../../services';
import type { SurveyQuestion } from '../../types';

const suggestedCategories = [
  'Job Satisfaction', 'Employee Motivation', 'Employee Engagement', 'Communication', 'Work Environment', 'Relationship with Management', 'Organizational Commitment',
];

function QuestionModal({ open, question, onClose, onSaved }: { open: boolean; question: SurveyQuestion | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ text: '', category: '', displayOrder: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ text: question?.text ?? '', category: question?.category ?? '', displayOrder: question ? String(question.displayOrder) : '' });
    setErrors({});
    setFormError(null);
  }, [open, question]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.text.trim().length < 10) next.text = 'Write the full statement (at least 10 characters)';
    if (form.category.trim().length < 2) next.category = 'Category is required';
    if (form.displayOrder && (!/^\d+$/.test(form.displayOrder) || Number(form.displayOrder) > 10000)) next.displayOrder = 'Enter a whole number';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    const payload = { text: form.text.trim(), category: form.category.trim(), ...(form.displayOrder ? { displayOrder: Number(form.displayOrder) } : {}) };
    setSaving(true);
    try {
      if (question) await surveyService.updateQuestion(question.id, payload);
      else await surveyService.createQuestion(payload);
      toast.success(question ? 'Question updated' : 'Question added to the survey');
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(error.fieldErrors);
      else setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={question ? 'Edit question' : 'New question'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="question-form" loading={saving}>
            {question ? 'Save changes' : 'Add question'}
          </Button>
        </>
      }
    >
      <form id="question-form" onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="Statement" error={errors.text} hint="Phrase it so employees can answer from Strongly Disagree to Strongly Agree." required>
          {(props) => <textarea {...props} className={`${inputClass(errors.text)} min-h-24`} maxLength={500} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="I feel valued by my organization." />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Category" error={errors.category} required>
              {(props) => (
                <>
                  <input {...props} className={inputClass(errors.category)} list="question-categories" maxLength={100} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  <datalist id="question-categories">
                    {suggestedCategories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>
          <Field label="Position" error={errors.displayOrder} hint={question ? undefined : 'Blank = last'}>
            {(props) => <input {...props} className={inputClass(errors.displayOrder)} inputMode="numeric" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />}
          </Field>
        </div>
        {question && <Alert tone="info">Editing changes the wording shown with past answers too. For a different question, deactivate this one and add a new one.</Alert>}
      </form>
    </Modal>
  );
}

export function SurveyManagementPage() {
  const toast = useToast();
  const { data, error, reload } = useFetch(() => surveyService.questions(true), []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SurveyQuestion | null>(null);
  const [toggling, setToggling] = useState<SurveyQuestion | null>(null);
  const [busy, setBusy] = useState(false);

  const activeCount = data?.filter((question) => question.isActive).length ?? 0;

  const toggle = async () => {
    if (!toggling) return;
    setBusy(true);
    try {
      await surveyService.updateQuestion(toggling.id, { isActive: !toggling.isActive });
      toast.success(toggling.isActive ? 'Question deactivated. It no longer appears in the survey.' : 'Question activated. It now appears in the survey.');
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
      setToggling(null);
      reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Survey Management"
        description="Questions for the Organizational Behavior survey. Changes apply to the next survey an employee opens."
        actions={
          <Button
            icon={<FiPlus aria-hidden />}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            Add question
          </Button>
        }
      />
      {data && activeCount < 6 && (
        <div className="mb-4">
          <Alert tone="warning">Only {activeCount} question{activeCount === 1 ? ' is' : 's are'} active. At least 6 are recommended for a meaningful survey.</Alert>
        </div>
      )}
      <Card padded={false} title={data ? `${data.length} questions · ${activeCount} active` : 'Questions'} description="Every question uses a 5-point scale from Strongly Disagree to Strongly Agree">
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : !data ? (
          <PageLoader />
        ) : data.length === 0 ? (
          <EmptyState title="No questions yet" description="Add the first question to make the survey available to employees." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Question</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((question) => (
                  <tr key={question.id} className={question.isActive ? '' : 'opacity-60'}>
                    <td className="tabular-nums">{question.displayOrder}</td>
                    <td className="min-w-72 font-medium !text-ink">{question.text}</td>
                    <td className="whitespace-nowrap">{question.category}</td>
                    <td>
                      <Badge tone={question.isActive ? 'green' : 'slate'}>{question.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(question.updatedAt)}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<FiEdit2 aria-hidden />}
                          onClick={() => {
                            setEditing(question);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setToggling(question)}>
                          {question.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <QuestionModal open={modalOpen} question={editing} onClose={() => setModalOpen(false)} onSaved={reload} />
      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.isActive ? 'Deactivate question?' : 'Activate question?'}
        message={
          <>
            <p className="mb-2 font-medium text-ink">“{toggling?.text}”</p>
            {toggling?.isActive
              ? 'It will be removed from the survey for employees who have not answered yet. Existing answers are kept.'
              : 'It will be added to the survey and required for every employee who takes it from now on.'}
          </>
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Activate'}
        loading={busy}
        onConfirm={toggle}
        onCancel={() => setToggling(null)}
      />
    </>
  );
}
