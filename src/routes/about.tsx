import { createFileRoute } from '@tanstack/react-router'
import { Bot, Github, ExternalLink, Heart, Zap, Shield, Cpu } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Fast & Efficient",
      description: "Built with modern React and optimized for performance"
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Privacy First",
      description: "All conversations run locally on your machine"
    },
    {
      icon: <Cpu className="h-5 w-5" />,
      title: "Multiple Models",
      description: "Support for various AI models through Ollama"
    },
    {
      icon: <Heart className="h-5 w-5" />,
      title: "Open Source",
      description: "Free and open source with active community"
    }
  ]

  const techStack = [
    { name: "React 19", description: "Latest React with concurrent features" },
    { name: "TypeScript", description: "Type-safe development experience" },
    { name: "TanStack Router", description: "Type-safe routing for React" },
    { name: "Tailwind CSS", description: "Utility-first CSS framework" },
    { name: "shadcn/ui", description: "Beautiful and accessible components" },
    { name: "Radix UI", description: "Low-level accessible primitives" },
    { name: "Vite", description: "Lightning-fast build tool" },
    { name: "Ollama", description: "Local AI model runtime" }
  ]

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] p-6">
      <div className="w-full space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
              <Bot className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">ChaiChat</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A beautiful, modern interface for chatting with AI models running locally through Ollama. 
            Experience the power of local AI with a sleek, responsive design.
          </p>
          <div className="flex justify-center gap-4">
            <Button asChild>
              <a href="https://github.com/ollama/ollama" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4 mr-2" />
                Ollama GitHub
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">
                Learn More
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Features Section */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Features</h2>
            <p className="text-muted-foreground">
              Built with modern technologies for the best user experience
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {feature.icon}
                    </div>
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Separator />

        {/* Tech Stack Section */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Tech Stack</h2>
            <p className="text-muted-foreground">
              Built with cutting-edge technologies for optimal performance
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Technologies Used</CardTitle>
              <CardDescription>
                A modern stack focused on developer experience and user performance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {techStack.map((tech, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-1">
                      <div className="font-medium">{tech.name}</div>
                      <div className="text-sm text-muted-foreground">{tech.description}</div>
                    </div>
                    <Badge variant="outline">Library</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Getting Started */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Getting Started</h2>
            <p className="text-muted-foreground">
              Follow these steps to start using ChaiChat
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline">1</Badge>
                  Install Ollama
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Download and install Ollama on your local machine
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://ollama.ai/download" target="_blank" rel="noopener noreferrer">
                    Download Ollama
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline">2</Badge>
                  Download Models
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Pull AI models using the Ollama CLI
                </p>
                <code className="text-sm bg-muted p-2 rounded block">
                  ollama pull gemma2:1b
                </code>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline">3</Badge>
                  Start Chatting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Launch Ollama and start chatting through this interface
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href="/">
                    Go to Chat
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            Built with ❤️ using modern React and shadcn/ui components
          </p>
        </div>
      </div>
    </div>
  )
} 