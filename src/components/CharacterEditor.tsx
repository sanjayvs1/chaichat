import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Save, User, X } from 'lucide-react'
import { Separator } from './ui/separator'
import type { Character } from '../types/ollama'

interface CharacterEditorProps {
  character?: Character
  onSave: (character: Character) => void
  onCancel: () => void
  isLoading?: boolean
}

export function CharacterEditor({ 
  character, 
  onSave, 
  onCancel, 
  isLoading = false 
}: CharacterEditorProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    avatar: '',
    isDefault: false
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [previewValid, setPreviewValid] = useState<boolean>(true)

  useEffect(() => {
    if (character) {
      setFormData({
        name: character.name,
        description: character.description,
        avatar: character.avatar || '',
        isDefault: character.isDefault || false
      })
    }
  }, [character])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    const now = new Date().toISOString()
    const characterData: Character = {
      id: character?.id || crypto.randomUUID(),
      name: formData.name.trim(),
      description: formData.description.trim(),
      avatar: formData.avatar.trim() || undefined,
      isDefault: formData.isDefault,
      createdAt: character?.createdAt || now,
      updatedAt: now
    }

    onSave(characterData)
  }

  useEffect(() => {
    if (!formData.avatar) {
      setPreviewValid(true)
      return
    }
    const img = new Image()
    img.onload = () => setPreviewValid(true)
    img.onerror = () => setPreviewValid(false)
    img.src = formData.avatar
  }, [formData.avatar])
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">
              {character ? 'Edit Character' : 'Create New Character'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {character ? 'Modify character details and personality' : 'Create a new character with custom personality and background'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Character Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 flex-shrink-0">
                {formData.avatar && previewValid ? (
                  <AvatarImage src={formData.avatar} alt={formData.name} />
                ) : (
                  <AvatarFallback className="text-lg">
                    {formData.name ? getInitials(formData.name) : <User className="h-8 w-8" />}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg mb-2">{formData.name || 'Character Name'}</h3>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {formData.description || 'Character description will appear here'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Character Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter character name"
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Avatar URL (optional)</label>
                <Input
                  value={formData.avatar}
                  onChange={(e) => setFormData(prev => ({ ...prev, avatar: e.target.value }))}
                  placeholder="https://example.com/avatar.jpg"
                />
                {!previewValid && formData.avatar && (
                  <p className="text-xs text-destructive">Could not load image from this URL</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="isDefault"
                type="checkbox"
                className="h-4 w-4"
                checked={formData.isDefault}
                onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
              />
              <label htmlFor="isDefault" className="text-sm">Mark as default character</label>
            </div>
          </CardContent>
        </Card>

        {/* Character Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Character Description *</CardTitle>
            <CardDescription>
              Describe the character's personality, background, speaking style, and any other relevant details. 
              This will help the AI understand how to roleplay as this character.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the character's personality, background, speaking style, and any other relevant details..."
              rows={12}
              className={`resize-none ${errors.description ? 'border-destructive' : ''}`}
            />
            {errors.description && <p className="text-sm text-destructive mt-2">{errors.description}</p>}
            <div className="text-xs text-muted-foreground mt-2">
              Characters: {formData.description.length}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} size="lg">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} size="lg">
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Character'}
          </Button>
        </div>
      </form>
    </div>
  )
} 