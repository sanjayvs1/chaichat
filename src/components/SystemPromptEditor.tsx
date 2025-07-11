import { Textarea } from './ui/textarea'
import { Button } from './ui/button'
import { useState } from 'react'

type Props = {
  value: string
  onChange: (val: string) => void
}

export function SystemPromptEditor({ value, onChange }: Props) {
  const [local, setLocal] = useState(value)

  const save = () => {
    onChange(local)
  }

  return (
    <div className="space-y-2 w-80 max-w-full">
      <Textarea
        placeholder="Enter system prompt (optional)"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        rows={4}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={() => setLocal(value)} variant="ghost" size="sm">Reset</Button>
        <Button onClick={save} size="sm">Save</Button>
      </div>
    </div>
  )
} 