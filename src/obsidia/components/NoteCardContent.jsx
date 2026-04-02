import { memo } from 'react';

function NoteCardContent({ cardId, allCards, updateCard, deleteCard }) {
  const card = allCards.find(c => c.id === cardId);
  if (!card) return null;

  return (
    <div className="ob-notecard-inner">
      <div className="ob-notecard-row">
        <div
          className="ob-notecard-title"
          contentEditable
          suppressContentEditableWarning
          ref={el => { if (el && document.activeElement !== el) el.innerText = card.title || ''; }}
          onMouseDown={e => e.stopPropagation()}
          onInput={e => updateCard(cardId, { title: e.currentTarget.innerText })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        />
      </div>
      <div
        className="ob-notecard-content"
        contentEditable
        suppressContentEditableWarning
        ref={el => { if (el && document.activeElement !== el) el.innerText = card.content || ''; }}
        onMouseDown={e => e.stopPropagation()}
        onInput={e => updateCard(cardId, { content: e.currentTarget.innerText })}
        data-placeholder="Add content..."
      />
    </div>
  );
}

export default memo(NoteCardContent);
