import Modal from './Modal.jsx'

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmText = 'បញ្ជាក់', cancelText = 'បោះបង់',
  variant = 'danger', loading = false,
}) {
  const colors = {
    danger:  'btn-danger',
    warning: 'bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700',
    primary: 'btn-primary',
  }
  return (
    <Modal open={open} onClose={onClose} title={title || 'តើអ្នកប្រាកដទេ?'} size="sm">
      <p className="text-sm text-gray-600 mb-6">{message || 'សកម្មភាពនេះមិនអាចដកហូតវិញបានទេ។'}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary" disabled={loading}>
          {cancelText}
        </button>
        <button onClick={onConfirm} className={colors[variant]} disabled={loading}>
          {loading ? 'កំពុង...' : confirmText}
        </button>
      </div>
    </Modal>
  )
}