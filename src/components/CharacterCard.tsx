import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { MoreHorizontal, Edit, Trash2, MessageCircle, Copy } from 'lucide-react'
import type { Character } from '../types/ollama'

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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <Card className={`cursor-pointer transition-all hover:shadow-md flex flex-col h-full ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar className="h-10 w-10">
              {character.avatar ? (
                <AvatarImage src={character.avatar} alt={character.name} />
              ) : (
                <AvatarFallback>{getInitials(character.name)}</AvatarFallback>
              )}
            </Avatar>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {character.name}
                {character.isDefault && (
                  <Badge variant="secondary" className="text-xs">
                    Default
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-sm">
                {character.description}
              </CardDescription>
            </div>
          </div>
          
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
      </CardHeader>
      
      <CardContent className="pt-0 flex-1 flex flex-col justify-end">
        <Button 
          onClick={handleSelect}
          disabled={isLoading}
          className="w-full"
          variant={isSelected ? "default" : "outline"}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          {isSelected ? 'Selected' : 'Chat with'}
        </Button>
      </CardContent>
    </Card>
  )
} 