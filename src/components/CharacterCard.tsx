import { useState } from 'react'
import { Card, CardContent, CardDescription, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { CharacterAvatar } from './CharacterAvatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { MoreHorizontal, Edit, Trash2, MessageCircle, Copy, Brain } from 'lucide-react'
import type { Character } from '../types/chat'

interface CharacterCardProps {
  character: Character
  onEdit: (character: Character) => void
  onDelete: (characterId: string) => void
  onSelect: (character: Character) => void
  onDuplicate: (character: Character) => void
  isSelected?: boolean
}

export function CharacterCard({ 
  character, 
  onEdit, 
  onDelete, 
  onSelect, 
  onDuplicate,
  isSelected = false 
}: CharacterCardProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSelect = async () => {
    setIsLoading(true)
    try {
      await onSelect(character)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <CharacterAvatar
              avatar={character.avatar}
              name={character.name}
              className="h-10 w-10 flex-shrink-0 text-base"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <CardTitle className="text-base truncate">
                  {character.name}
                </CardTitle>
                {character.isDefault && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    Default
                  </Badge>
                )}
                {character.memoryEnabled !== false && (
                  <span title="Long-term memory enabled" className="flex-shrink-0">
                    <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                )}
              </div>
              <CardDescription className="text-sm line-clamp-2">
                {character.tagline || character.description}
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <Button 
              onClick={handleSelect}
              disabled={isLoading}
              size="sm"
              variant={isSelected ? "default" : "outline"}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              {isSelected ? 'Selected' : 'Chat'}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(character)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(character)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                {!character.isDefault && (
                  <DropdownMenuItem 
                    onClick={() => onDelete(character.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
