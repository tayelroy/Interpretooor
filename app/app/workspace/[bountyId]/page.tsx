'use client';

import { useParams, useRouter } from 'next/navigation';
import { useWorkspaceTranslation } from '@/hooks/useWorkspaceTranslation';
import WorkspaceLoadingState from './components/WorkspaceLoadingState';
import WorkspaceErrorState from './components/WorkspaceErrorState';
import WorkspaceHeader from './components/WorkspaceHeader';
import OriginalSourcePanel from './components/OriginalSourcePanel';
import TranslationEditorPanel from './components/TranslationEditorPanel';
import SubmissionFooter from './components/SubmissionFooter';

export default function WorkspacePage() {
  const params = useParams();
  const bountyId = params.bountyId as string;
  const router = useRouter();

  const {
    bounty,
    originalParsed,
    translatedParsed,
    loading,
    loadError,
    submitting,
    submitSuccess,
    aiSuggestion,
    aiLoading,
    importError,
    canSubmit,
    actions,
    fileInputRef,
  } = useWorkspaceTranslation(bountyId);

  if (loading) return <WorkspaceLoadingState />;

  if (loadError || !bounty) {
    return <WorkspaceErrorState message={loadError} onBack={() => router.back()} />;
  }

  return (
    <div className="min-h-screen bg-parchment pt-32 pb-20 px-8">
      <div className="max-w-7xl mx-auto">
        <WorkspaceHeader
          bountyId={bountyId}
          targetLanguage={bounty.targetLanguage}
          onBack={() => router.push(`/app/bounty/${bountyId}`)}
        />

        <SubmissionFooter
          canSubmit={canSubmit}
          submitting={submitting}
          submitSuccess={submitSuccess}
          onSubmit={actions.submit}
        />

        <div className="flex flex-col lg:flex-row gap-6 bg-stone-100 p-3 rounded-[40px]">
          <OriginalSourcePanel parsedMdh={originalParsed} />
          <TranslationEditorPanel
            targetLanguage={bounty.targetLanguage}
            translatedParsed={translatedParsed}
            aiLoading={aiLoading}
            aiSuggestion={aiSuggestion}
            importError={importError}
            fileInputRef={fileInputRef}
            onImportChange={actions.importFile}
            onApplyAiSuggestion={actions.applyAiSuggestion}
          />
        </div>
      </div>
    </div>
  );
}
