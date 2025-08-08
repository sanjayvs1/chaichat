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
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <CardTitle className="text-xl">
              {character ? 'Edit Character' : 'Create New Character'}
            </CardTitle>
            <CardDescription className="mt-2">
              {character ? 'Modify character details and personality' : 'Create a new character with custom personality and background'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} className="shrink-0 ml-4">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Character Preview */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <Avatar className="h-16 w-16">
              {formData.avatar && previewValid ? (
                <AvatarImage src={formData.avatar} alt={formData.name} />
              ) : (
                <AvatarFallback className="text-lg">
                  {formData.name ? getInitials(formData.name) : <User className="h-8 w-8" />}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold">{formData.name || 'Character Name'}</h3>
              <p className="text-sm text-muted-foreground">
                {formData.description || 'Character description will appear here'}
              </p>
            </div>
          </div>

          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter character name"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Avatar URL</label>
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Description *</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of the character"
              rows={2}
              className={errors.description ? 'border-destructive' : ''}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <input
              id="isDefault"
              type="checkbox"
              className="h-4 w-4"
              checked={formData.isDefault}
              onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
            />
            <label htmlFor="isDefault" className="text-sm">Mark as default character</label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Character'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
} 