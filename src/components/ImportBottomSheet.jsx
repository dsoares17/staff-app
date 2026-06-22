import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const stepConfig = {
  job: {
    title: 'Trabalho',
    aiLabel: '✨ Importar com IA',
    aiSubtitle: 'Importa de texto, Excel ou foto',
    aiPath: '/jobs/import',
    manualSubtitle: 'Preenche os detalhes manualmente',
    manualPath: '/jobs/new',
  },
  expense: {
    title: 'Recibo / Despesa',
    aiLabel: '✨ Digitalizar com IA',
    aiSubtitle: 'Tira uma foto ou escolhe da galeria',
    aiPath: '/expenses/scan',
    manualSubtitle: 'Introduz os dados da despesa',
    manualPath: '/expenses/new',
  },
}

function BackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChoiceButton({ emoji, label, subtitle, onClick, variant = 'default' }) {
  const isAi = variant === 'ai'

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border py-4 text-left transition-colors active:opacity-90"
      style={{
        backgroundColor: isAi ? '#A855F714' : '#1A1A1A',
        borderColor: isAi ? '#A855F7' : '#333333',
      }}
    >
      <p
        className="px-4 text-base font-medium"
        style={{ color: isAi ? '#A855F7' : '#ffffff' }}
      >
        {emoji ? `${emoji} ${label}` : label}
      </p>
      <p className="mt-1 px-4 text-xs text-[#888888]">{subtitle}</p>
    </button>
  )
}

export default function ImportBottomSheet({ open, onClose }) {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState(null)

  useEffect(() => {
    if (!open) {
      setVisible(false)
      return undefined
    }

    const timer = window.setTimeout(() => setVisible(true), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) {
      setStep(1)
      setSelectedType(null)
    }
  }, [open])

  if (!open) return null

  function handleNavigate(path) {
    onClose()
    navigate(path)
  }

  function selectType(type) {
    setSelectedType(type)
    setStep(2)
  }

  function goBack() {
    setStep(1)
    setSelectedType(null)
  }

  const config = selectedType ? stepConfig[selectedType] : null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-[480px] overflow-hidden rounded-t-2xl p-5 transition-transform duration-200 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ backgroundColor: '#141414' }}
      >
        <div className="mb-4 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[#444444]" />
        </div>

        <div className="relative overflow-hidden transition-[height] duration-300 ease-out">
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: step === 1 ? 'translateX(0)' : 'translateX(-100%)' }}
          >
            <div className="w-full shrink-0">
              <h2 className="mb-4 text-base font-semibold text-fg">O que queres adicionar?</h2>

              <div className="space-y-3">
                <ChoiceButton
                  emoji="💼"
                  label="Trabalho"
                  subtitle="Adiciona um novo trabalho"
                  onClick={() => selectType('job')}
                />
                <ChoiceButton
                  emoji="🧾"
                  label="Recibo / Despesa"
                  subtitle="Regista uma despesa ou recibo"
                  onClick={() => selectType('expense')}
                />
              </div>
            </div>

            <div className="w-full shrink-0">
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Voltar"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[#888888] active:bg-[#222222]"
                >
                  <BackIcon />
                </button>
                <h2 className="text-base font-semibold text-fg">{config?.title}</h2>
              </div>

              <p className="mb-4 text-sm text-[#888888]">Como queres adicionar?</p>

              <div className="space-y-3">
                <ChoiceButton
                  label={config?.aiLabel ?? ''}
                  subtitle={config?.aiSubtitle ?? ''}
                  variant="ai"
                  onClick={() => handleNavigate(config?.aiPath ?? '/jobs/import')}
                />
                <ChoiceButton
                  emoji="➕"
                  label="Adicionar manualmente"
                  subtitle={config?.manualSubtitle ?? ''}
                  onClick={() => handleNavigate(config?.manualPath ?? '/jobs/new')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
