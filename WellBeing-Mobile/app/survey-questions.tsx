import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../src/api/client';
import { surveyService } from '../src/api/services';
import { RoleGate } from '../src/components/RoleGate';
import { Badge, Banner, Button, Card, Input, Row, Screen, Sheet, SkeletonList, T } from '../src/components/ui';
import { Boundary, useApi, useRefresh } from '../src/hooks/useData';
import type { SurveyQuestion } from '../src/types';

function Inner() {
  const client = useQueryClient();
  const query = useApi(['survey', 'admin-questions'], () => surveyService.questions(true));
  const { refreshing, onRefresh } = useRefresh(query.refetch);
  const [editing, setEditing] = useState<SurveyQuestion | 'new' | null>(null);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (q: SurveyQuestion | 'new') => {
    setEditing(q);
    setError(null);
    setText(q === 'new' ? '' : q.text);
    setCategory(q === 'new' ? '' : q.category);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(null);
      await client.invalidateQueries({ queryKey: ['survey'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Button title="Add question" icon="add-circle" onPress={() => open('new')} testID="q-add" />
      <Boundary query={query} skeleton={<SkeletonList />}>
        {(qs) => (
          <>
            {qs.map((q) => (
              <Card key={q.id} onPress={() => open(q)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="caption">{q.category}</T>
                  <Badge label={q.isActive ? 'Active' : 'Inactive'} tone={q.isActive ? 'success' : 'neutral'} />
                </Row>
                <T variant="body">{q.text}</T>
              </Card>
            ))}
          </>
        )}
      </Boundary>
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New question' : 'Edit question'}>
        <Input label="Question" value={text} onChangeText={setText} multiline autoCapitalize="sentences" testID="q-text" />
        <Input label="Category" value={category} onChangeText={setCategory} autoCapitalize="words" testID="q-category" />
        {error ? <Banner tone="danger" text={error} /> : null}
        <Button title="Save" loading={busy} testID="q-save" onPress={() => run(() => (editing === 'new' ? surveyService.createQuestion({ text: text.trim(), category: category.trim() }) : surveyService.updateQuestion((editing as SurveyQuestion).id, { text: text.trim(), category: category.trim() })))} />
        {editing && editing !== 'new' ? (
          <Button title={editing.isActive ? 'Deactivate question' : 'Activate question'} variant="secondary" loading={busy} onPress={() => run(() => surveyService.updateQuestion((editing as SurveyQuestion).id, { isActive: !(editing as SurveyQuestion).isActive }))} />
        ) : null}
      </Sheet>
    </Screen>
  );
}

export default function SurveyQuestions() {
  return (
    <RoleGate allow={['HR', 'SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
