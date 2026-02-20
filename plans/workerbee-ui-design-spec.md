# WorkerBee UI Design Specification

## Overview

This document defines the visual design language and UI specifications for WorkerBee, based on the "Ceramic Future" design system. The design emphasizes an industrial, mechanical aesthetic with warm, tactile elements that make AI-powered workflows feel approachable and professional.

---

## 1. Design System Tokens

### 1.1 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| **ceramic** | `#EBE8E3` | Primary background, canvas area |
| **ceramic-dark** | `#F7F5F0` | Sidebar background |
| **plastic** | `#FDFCF9` | Card backgrounds, elevated surfaces |
| **espresso** | `#3E3430` | Primary text, headings |
| **espresso-dark** | `#2C2420` | Terminal background, dark surfaces |
| **tungsten** | `#8C8682` | Muted text, secondary elements |
| **amber** | `#DDAA44` | Primary accent, interactive elements |
| **amber-light** | `#E4AD3F` | Hover states, highlights |
| **signal-green** | `#6B9E78` | Success states, online indicators |
| **signal-red** | `#CC5544` | Error states, warnings |
| **tinted-paper** | `#F2F0EB` | Textarea backgrounds, input fields |

### 1.2 Typography

| Token | Font | Weights | Usage |
|-------|------|---------|-------|
| **display** | Space Grotesk | 300, 400, 500, 600, 700 | Headings, labels, buttons |
| **body** | IBM Plex Sans | 400, 500, 600 | Body text, descriptions |
| **mono** | IBM Plex Mono | 400, 500, 600 | Code, IDs, timestamps |

#### Font Sizes

```css
/* Display Font Sizes */
.text-display-xl { font-size: 2.5rem; line-height: 1.1; }  /* 40px */
.text-display-lg { font-size: 1.875rem; line-height: 1.2; } /* 30px */
.text-display-md { font-size: 1.25rem; line-height: 1.3; }  /* 20px */
.text-display-sm { font-size: 1rem; line-height: 1.4; }     /* 16px */

/* Body Font Sizes */
.text-body-lg { font-size: 1rem; line-height: 1.5; }     /* 16px */
.text-body-md { font-size: 0.875rem; line-height: 1.5; } /* 14px */
.text-body-sm { font-size: 0.75rem; line-height: 1.5; }  /* 12px */

/* Mono Font Sizes */
.text-mono-md { font-size: 0.875rem; } /* 14px */
.text-mono-sm { font-size: 0.75rem; }  /* 12px */
.text-mono-xs { font-size: 0.625rem; } /* 10px */
```

### 1.3 Shadows

| Token | Value | Usage |
|-------|-------|-------|
| **lift** | `0 8px 24px -4px rgba(62, 52, 48, 0.12), 0 2px 6px -1px rgba(62, 52, 48, 0.04)` | Elevated cards, nodes |
| **deep** | `0 20px 40px -8px rgba(62, 52, 48, 0.2)` | Modals, floating panels |
| **soft** | `0 4px 12px rgba(62, 52, 48, 0.08)` | Subtle elevation |
| **inset** | `inset 0 2px 4px rgba(62, 52, 48, 0.05)` | Input fields, depressed states |
| **inset-slot** | `inset 0 2px 4px rgba(62, 52, 48, 0.08)` | Search slots, text inputs |
| **glow** | `0 0 12px rgba(221, 170, 68, 0.4)` | Focus states, active elements |

### 1.4 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| **sm** | `8px` | Small elements, tags |
| **md** | `12px` | Buttons, inputs |
| **lg** | `16px` | Cards, panels |
| **xl** | `24px` | Large containers, modals |
| **full** | `9999px` | Pills, avatars, circular buttons |

### 1.5 Spacing Scale

| Token | Value |
|-------|-------|
| **space-1** | `4px` |
| **space-2** | `8px` |
| **space-3** | `12px` |
| **space-4** | `16px` |
| **space-5** | `20px` |
| **space-6** | `24px` |
| **space-8** | `32px` |
| **space-10** | `40px` |
| **space-12** | `48px` |

---

## 2. Component Specifications

### 2.1 Buttons

#### Primary Button (Amber)

```html
<button class="px-4 py-2.5 bg-amber text-espresso-dark font-display font-bold 
               text-sm rounded-xl shadow-[0_4px_0_#b88a32,0_8px_16px_rgba(228,173,63,0.4)] 
               active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] 
               active:translate-y-[1px] transition-all">
    Button Text
</button>
```

**States:**
- **Default**: Amber background with 3D shadow effect
- **Hover**: Slight brightness increase
- **Active/Pressed**: Shadow collapses, button moves down 1px (pneumatic effect)
- **Disabled**: 50% opacity, no shadow

#### Secondary Button (Outline)

```html
<button class="px-4 py-2.5 border border-tungsten/30 text-espresso font-display 
               font-bold text-sm rounded-xl hover:bg-ceramic hover:border-tungsten/50 
               transition-all">
    Button Text
</button>
```

#### Icon Button

```html
<button class="w-10 h-10 flex items-center justify-center rounded-xl text-tungsten 
               hover:text-espresso hover:bg-ceramic transition-colors">
    <span class="material-symbols-outlined">settings</span>
</button>
```

### 2.2 Input Fields

#### Text Input (Slot Style)

```html
<div class="group relative w-full h-12 bg-ceramic rounded-xl border border-transparent 
            shadow-inset-slot flex items-center px-4 transition-all duration-200 
            focus-within:border-amber focus-within:shadow-[inset_0_2px_4px_rgba(62,52,48,0.15)]">
    <span class="material-symbols-outlined text-tungsten group-focus-within:text-amber 
                 transition-colors">search</span>
    <input class="w-full bg-transparent border-none focus:ring-0 text-espresso 
                  placeholder-tungsten font-body text-sm ml-2 h-full" 
           placeholder="Enter text..." type="text" />
</div>
```

#### Select Dropdown

```html
<div class="relative group">
    <select class="w-full appearance-none bg-ceramic border border-tungsten/20 
                   text-espresso font-mono text-sm rounded-lg px-4 py-3 
                   focus:outline-none focus:ring-2 focus:ring-amber/50 shadow-inset">
        <option>Option 1</option>
        <option>Option 2</option>
    </select>
    <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-tungsten">
        <span class="material-symbols-outlined text-sm">expand_more</span>
    </div>
</div>
```

#### Textarea (Tinted Paper)

```html
<textarea class="w-full h-32 bg-tinted-paper text-espresso font-mono text-xs 
                 leading-relaxed p-4 rounded-lg border-none shadow-inset resize-none 
                 focus:ring-1 focus:ring-amber/30 outline-none 
                 selection:bg-amber/30 custom-scrollbar">
</textarea>
```

### 2.3 Cards

#### Node Card (Workflow Canvas)

```html
<div class="w-[280px] bg-plastic rounded-xl shadow-lift border border-ceramic 
            hover:border-amber hover:shadow-lg transition-all duration-200">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-[#F3EFE8]">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-ceramic flex items-center justify-center 
                        text-espresso">
                <span class="material-symbols-outlined text-[18px]">smart_toy</span>
            </div>
            <span class="font-display font-bold text-sm text-espresso">Node Title</span>
        </div>
        <!-- Status LED -->
        <div class="w-2 h-2 rounded-full bg-signal-green shadow-[0_0_6px_rgba(107,158,120,0.6)]">
        </div>
    </div>
    <!-- Body -->
    <div class="p-4">
        <!-- Content -->
    </div>
    <!-- Status Bar (Optional) -->
    <div class="px-4 py-2 bg-ceramic/50 border-t border-[#F3EFE8] rounded-b-xl">
        <span class="text-[10px] text-amber font-bold uppercase tracking-wider">
            Status Text
        </span>
    </div>
</div>
```

#### Module Card (Sidebar - Draggable)

```html
<div class="cursor-grab bg-plastic border border-ceramic rounded-xl p-3 
            flex items-center justify-between group hover:border-amber 
            hover:shadow-soft transition-all">
    <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-ceramic flex items-center justify-center 
                    border border-ceramic shadow-inner text-espresso">
            <span class="material-symbols-outlined text-[20px]">psychology</span>
        </div>
        <div class="flex flex-col">
            <span class="font-display font-bold text-sm text-espresso leading-tight 
                        group-hover:text-amber transition-colors">Module Name</span>
            <span class="font-body text-[11px] text-tungsten leading-tight mt-0.5">
                Description
            </span>
        </div>
    </div>
    <div class="opacity-0 group-hover:opacity-100 transition-opacity text-tungsten">
        <span class="material-symbols-outlined text-[16px]">drag_indicator</span>
    </div>
</div>
```

### 2.4 Status Indicators

#### LED Indicators

```html
<!-- Active/Online -->
<div class="w-2 h-2 rounded-full bg-signal-green shadow-[0_0_6px_rgba(107,158,120,0.6)]">
</div>

<!-- Processing -->
<div class="w-2 h-2 rounded-full bg-amber animate-pulse"></div>

<!-- Error -->
<div class="w-2 h-2 rounded-full bg-signal-red shadow-[0_0_6px_rgba(204,85,68,0.6)]"></div>

<!-- Inactive -->
<div class="w-2 h-2 rounded-full bg-tungsten/30"></div>
```

#### Status Badge

```html
<div class="flex items-center gap-2 px-3 py-1.5 bg-ceramic rounded-full border border-[#D6D1CC]">
    <div class="w-2 h-2 rounded-full bg-signal-green animate-pulse"></div>
    <span class="text-xs font-mono font-medium text-tungsten uppercase tracking-wider">
        System Ready
    </span>
</div>
```

### 2.5 Terminal/Log Drawer

```html
<section class="fixed bottom-0 left-0 right-0 z-50 h-[300px] bg-espresso-dark 
               font-mono text-sm border-t border-espresso/20 shadow-[0_-4px_20px_rgba(0,0,0,0.15)]">
    <!-- Handle Bar -->
    <div class="h-10 bg-[#362e2a] flex items-center justify-between px-4 cursor-pointer 
                hover:bg-[#3f3632] transition-colors border-b border-[#4a3e36]">
        <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-tungsten text-[20px]">expand_more</span>
            <span class="text-tungsten text-xs font-bold tracking-wider">
                SYSTEM LOG // TERMINAL
            </span>
            <span class="w-1.5 h-1.5 rounded-full bg-amber animate-pulse ml-1"></span>
        </div>
        <div class="flex items-center gap-3">
            <button class="text-tungsten hover:text-ceramic text-xs">CLEAR</button>
            <button class="text-tungsten hover:text-ceramic text-xs">COPY</button>
        </div>
    </div>
    
    <!-- Log Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-1.5 relative">
        <!-- CRT Overlay -->
        <div class="absolute inset-0 pointer-events-none opacity-30"
             style="background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%),
                    linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06));
                    background-size: 100% 2px, 3px 100%;">
        </div>
        
        <!-- Log Entry -->
        <div class="flex gap-3 hover:bg-white/5 px-1 rounded transition-colors">
            <span class="text-tungsten">[14:02:41]</span>
            <span class="text-amber font-bold">[SYSTEM]</span>
            <span class="text-ceramic/90">Log message here...</span>
        </div>
    </div>
    
    <!-- Status Footer -->
    <div class="h-8 bg-[#251e1b] border-t border-[#4a3e36] flex items-center justify-between 
                px-4 text-[11px] text-tungsten">
        <div class="flex items-center gap-4">
            <span>MEM: 45MB</span>
            <span>CPU: 12%</span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-signal-green"></div>
            <span class="text-signal-green">ONLINE</span>
        </div>
    </div>
</section>
```

---

## 3. Page Layouts

### 3.1 Landing Page

The landing page introduces WorkerBee to new users with a clean, focused design that highlights the product's value proposition.

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  NAVIGATION BAR (h-16)                                          │
│  [Logo] [Product] [Pricing] [Docs]        [Login] [Get Started] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HERO SECTION                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    [Headline]                              │  │
│  │                    [Subheadline]                           │  │
│  │              [CTA Button] [Secondary CTA]                  │  │
│  │                                                            │  │
│  │              [Hero Image/Animation]                        │  │
│  │         (Workflow canvas with animated nodes)              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  FEATURES SECTION                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Feature 1  │  │  Feature 2  │  │  Feature 3  │             │
│  │  [Icon]     │  │  [Icon]     │  │  [Icon]     │             │
│  │  Title      │  │  Title      │  │  Title      │             │
│  │  Desc       │  │  Desc       │  │  Desc       │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  HOW IT WORKS SECTION                                           │
│  Step 1 → Step 2 → Step 3 → Step 4                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  CTA SECTION                                                    │
│  [Ready to automate your work?] [Get Started Free]              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  FOOTER                                                         │
│  [Logo] [Links] [Social] [Copyright]                            │
└─────────────────────────────────────────────────────────────────┘
```

#### Hero Section Implementation

```html
<section class="relative min-h-[80vh] flex flex-col items-center justify-center px-6 
                bg-ceramic overflow-hidden">
    <!-- Dot Grid Background -->
    <div class="absolute inset-0 opacity-20 pointer-events-none"
         style="background-image: radial-gradient(#8C8682 1.5px, transparent 1.5px);
                background-size: 40px 40px;">
    </div>
    
    <!-- Content -->
    <div class="relative z-10 text-center max-w-4xl mx-auto">
        <!-- Badge -->
        <div class="inline-flex items-center gap-2 px-4 py-2 bg-plastic rounded-full 
                    border border-[#D6D1CC] shadow-soft mb-8">
            <div class="w-2 h-2 rounded-full bg-amber animate-pulse"></div>
            <span class="text-xs font-mono font-medium text-tungsten uppercase tracking-wider">
                Now in Beta
            </span>
        </div>
        
        <!-- Headline -->
        <h1 class="font-display font-bold text-5xl md:text-6xl lg:text-7xl text-espresso 
                   tracking-tight leading-tight mb-6">
            Put AI Agents to<br/>
            <span class="text-amber">Real Work</span>
        </h1>
        
        <!-- Subheadline -->
        <p class="font-body text-lg md:text-xl text-tungsten max-w-2xl mx-auto mb-10">
            WorkerBee lets you build visual workflows that connect your documents, 
            data, and AI agents. No coding required.
        </p>
        
        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button class="px-8 py-4 bg-amber text-espresso-dark font-display font-bold 
                           text-base rounded-xl shadow-[0_4px_0_#b88a32,0_8px_20px_rgba(228,173,63,0.4)] 
                           active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] active:translate-y-[1px] 
                           transition-all flex items-center gap-2">
                Get Started Free
                <span class="material-symbols-outlined">arrow_forward</span>
            </button>
            <button class="px-8 py-4 border border-tungsten/30 text-espresso font-display 
                           font-bold text-base rounded-xl hover:bg-plastic 
                           hover:border-tungsten/50 transition-all">
                Watch Demo
            </button>
        </div>
    </div>
    
    <!-- Hero Image/Animation Container -->
    <div class="relative z-10 mt-16 w-full max-w-5xl mx-auto">
        <!-- Workflow Canvas Preview -->
        <div class="relative bg-plastic rounded-2xl shadow-deep border border-[#D6D1CC] 
                    overflow-hidden aspect-video">
            <!-- Canvas Content Preview -->
            <div class="absolute inset-0 bg-ceramic opacity-50"
                 style="background-image: radial-gradient(#8C8682 1px, transparent 1px);
                        background-size: 20px 20px;">
            </div>
            <!-- Animated Nodes would go here -->
        </div>
    </div>
</section>
```

### 3.2 Login Page

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  SPLIT LAYOUT                                                   │
│  ┌─────────────────────────┬───────────────────────────────────┐│
│  │                         │                                   ││
│  │    BRANDING PANEL       │        LOGIN FORM                 ││
│  │    (Left Side)          │        (Right Side)               ││
│  │                         │                                   ││
│  │    [Large Logo]         │        [Welcome Back]             ││
│  │    [Tagline]            │        [Email Input]              ││
│  │    [Feature bullets]    │        [Password Input]           ││
│  │    [Decorative          │        [Remember Me] [Forgot?]    ││
│  │     workflow graphic]   │        [Login Button]             ││
│  │                         │        ───────────────            ││
│  │                         │        [Or continue with]         ││
│  │                         │        [Google] [GitHub] [MS]     ││
│  │                         │        ───────────────            ││
│  │                         │        [No account? Sign up]      ││
│  │                         │                                   ││
│  └─────────────────────────┴───────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Login Page Implementation

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WorkerBee - Login</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        ceramic: "#EBE8E3",
                        plastic: "#FDFCF9",
                        espresso: "#3E3430",
                        tungsten: "#8C8682",
                        amber: "#DDAA44",
                        "signal-green": "#6B9E78",
                        "signal-red": "#CC5544",
                        "tinted-paper": "#F2F0EB",
                    },
                    fontFamily: {
                        display: ["Space Grotesk", "sans-serif"],
                        body: ["IBM Plex Sans", "sans-serif"],
                        mono: ["IBM Plex Mono", "monospace"],
                    },
                    boxShadow: {
                        lift: "0 8px 24px -4px rgba(62, 52, 48, 0.12)",
                        deep: "0 20px 40px -8px rgba(62, 52, 48, 0.2)",
                        inset: "inset 0 2px 4px rgba(62, 52, 48, 0.05)",
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-ceramic font-body text-espresso min-h-screen">
    <div class="min-h-screen flex">
        <!-- Left Panel - Branding -->
        <div class="hidden lg:flex lg:w-1/2 bg-espresso relative overflow-hidden">
            <!-- Dot Grid -->
            <div class="absolute inset-0 opacity-10"
                 style="background-image: radial-gradient(#8C8682 1px, transparent 1px);
                        background-size: 40px 40px;">
            </div>
            
            <!-- Content -->
            <div class="relative z-10 flex flex-col justify-center px-16 py-12">
                <!-- Logo -->
                <div class="flex items-center gap-3 mb-12">
                    <div class="w-12 h-12 bg-amber rounded-xl flex items-center justify-center 
                                shadow-lg">
                        <span class="material-symbols-outlined text-espresso-dark text-2xl">
                            hive
                        </span>
                    </div>
                    <span class="font-display font-bold text-2xl text-ceramic">WorkerBee</span>
                </div>
                
                <!-- Tagline -->
                <h1 class="font-display font-bold text-4xl text-ceramic leading-tight mb-6">
                    Automate your work<br/>
                    <span class="text-amber">with AI agents</span>
                </h1>
                
                <p class="font-body text-lg text-tungsten mb-12 max-w-md">
                    Build visual workflows that process documents, analyze data, 
                    and generate reports. No coding required.
                </p>
                
                <!-- Feature List -->
                <div class="space-y-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                            <span class="material-symbols-outlined text-amber text-lg">check</span>
                        </div>
                        <span class="text-ceramic font-body">Visual workflow builder</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                            <span class="material-symbols-outlined text-amber text-lg">check</span>
                        </div>
                        <span class="text-ceramic font-body">Multiple AI model support</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                            <span class="material-symbols-outlined text-amber text-lg">check</span>
                        </div>
                        <span class="text-ceramic font-body">Secure sandboxed execution</span>
                    </div>
                </div>
                
                <!-- Decorative Element -->
                <div class="absolute bottom-12 right-12 w-64 h-64 opacity-20">
                    <!-- Abstract workflow graphic -->
                    <svg viewBox="0 0 200 200" class="w-full h-full">
                        <circle cx="50" cy="50" r="20" fill="none" stroke="#DDAA44" stroke-width="2"/>
                        <circle cx="150" cy="100" r="20" fill="none" stroke="#DDAA44" stroke-width="2"/>
                        <circle cx="50" cy="150" r="20" fill="none" stroke="#DDAA44" stroke-width="2"/>
                        <path d="M70 50 Q100 50 130 100" fill="none" stroke="#8C8682" stroke-width="2" stroke-dasharray="4"/>
                        <path d="M130 100 Q100 150 70 150" fill="none" stroke="#8C8682" stroke-width="2" stroke-dasharray="4"/>
                    </svg>
                </div>
            </div>
        </div>
        
        <!-- Right Panel - Login Form -->
        <div class="w-full lg:w-1/2 flex items-center justify-center px-8 py-12">
            <div class="w-full max-w-md">
                <!-- Mobile Logo -->
                <div class="lg:hidden flex items-center gap-3 mb-8">
                    <div class="w-10 h-10 bg-espresso rounded-xl flex items-center justify-center">
                        <span class="material-symbols-outlined text-ceramic text-xl">hive</span>
                    </div>
                    <span class="font-display font-bold text-xl text-espresso">WorkerBee</span>
                </div>
                
                <!-- Form Header -->
                <div class="mb-8">
                    <h2 class="font-display font-bold text-3xl text-espresso mb-2">Welcome back</h2>
                    <p class="text-tungsten">Sign in to continue to your workspace</p>
                </div>
                
                <!-- Login Form -->
                <form class="space-y-6">
                    <!-- Email Input -->
                    <div class="space-y-2">
                        <label class="text-xs font-bold text-tungsten uppercase tracking-wider 
                                      font-display">
                            Email
                        </label>
                        <div class="group relative w-full h-12 bg-ceramic rounded-xl border 
                                    border-transparent shadow-[inset_0_2px_4px_rgba(62,52,48,0.05)] 
                                    flex items-center px-4 transition-all duration-200 
                                    focus-within:border-amber focus-within:shadow-[inset_0_2px_4px_rgba(62,52,48,0.15)]">
                            <span class="material-symbols-outlined text-tungsten 
                                         group-focus-within:text-amber transition-colors">
                                mail
                            </span>
                            <input type="email" 
                                   class="w-full bg-transparent border-none focus:ring-0 
                                          text-espresso placeholder-tungsten/50 font-body 
                                          text-sm ml-3 h-full" 
                                   placeholder="you@example.com" />
                        </div>
                    </div>
                    
                    <!-- Password Input -->
                    <div class="space-y-2">
                        <label class="text-xs font-bold text-tungsten uppercase tracking-wider 
                                      font-display">
                            Password
                        </label>
                        <div class="group relative w-full h-12 bg-ceramic rounded-xl border 
                                    border-transparent shadow-[inset_0_2px_4px_rgba(62,52,48,0.05)] 
                                    flex items-center px-4 transition-all duration-200 
                                    focus-within:border-amber focus-within:shadow-[inset_0_2px_4px_rgba(62,52,48,0.15)]">
                            <span class="material-symbols-outlined text-tungsten 
                                         group-focus-within:text-amber transition-colors">
                                lock
                            </span>
                            <input type="password" 
                                   class="w-full bg-transparent border-none focus:ring-0 
                                          text-espresso placeholder-tungsten/50 font-body 
                                          text-sm ml-3 h-full" 
                                   placeholder="••••••••" />
                            <button type="button" class="text-tungsten hover:text-espresso">
                                <span class="material-symbols-outlined text-lg">visibility</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Remember Me & Forgot Password -->
                    <div class="flex items-center justify-between">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" 
                                   class="w-4 h-4 rounded border-tungsten/30 bg-ceramic 
                                          text-amber focus:ring-amber/50" />
                            <span class="text-sm text-tungsten">Remember me</span>
                        </label>
                        <a href="#" class="text-sm text-amber hover:text-amber-light transition-colors">
                            Forgot password?
                        </a>
                    </div>
                    
                    <!-- Login Button -->
                    <button type="submit" 
                            class="w-full py-4 bg-espresso text-plastic font-display font-bold 
                                   text-sm rounded-xl hover:bg-[#2C2420] active:scale-[0.98] 
                                   transition-all shadow-lift flex items-center justify-center gap-2">
                        Sign In
                        <span class="material-symbols-outlined text-lg">arrow_forward</span>
                    </button>
                </form>
                
                <!-- Divider -->
                <div class="flex items-center gap-4 my-8">
                    <div class="flex-1 h-px bg-[#D6D1CC]"></div>
                    <span class="text-xs text-tungsten font-mono uppercase">or continue with</span>
                    <div class="flex-1 h-px bg-[#D6D1CC]"></div>
                </div>
                
                <!-- Social Login -->
                <div class="grid grid-cols-3 gap-4">
                    <button class="flex items-center justify-center gap-2 py-3 bg-plastic 
                                   border border-[#D6D1CC] rounded-xl hover:border-amber 
                                   hover:shadow-soft transition-all">
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                    </button>
                    <button class="flex items-center justify-center gap-2 py-3 bg-plastic 
                                   border border-[#D6D1CC] rounded-xl hover:border-amber 
                                   hover:shadow-soft transition-all">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                    </button>
                    <button class="flex items-center justify-center gap-2 py-3 bg-plastic 
                                   border border-[#D6D1CC] rounded-xl hover:border-amber 
                                   hover:shadow-soft transition-all">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11.4 24H0V12.6h11.4V24zM12.6 0V11.4H24V0H12.6zM11.4 0H0v11.4h11.4V0zM12.6 12.6V24H24V12.6H12.6z"/>
                        </svg>
                    </button>
                </div>
                
                <!-- Sign Up Link -->
                <p class="text-center text-sm text-tungsten mt-8">
                    Don't have an account? 
                    <a href="#" class="text-amber hover:text-amber-light font-medium transition-colors">
                        Sign up for free
                    </a>
                </p>
            </div>
        </div>
    </div>
</body>
</html>
```

### 3.3 Main Application Layout

The main application uses a three-panel layout with the workflow canvas as the central focus.

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP NAVIGATION BAR (h-16)                                      │
│  [Logo] [Project Name] [Status]        [Help] [Notifications] [User] │
├────────────────┬────────────────────────────────┬───────────────┤
│                │                                │               │
│  SIDEBAR       │     WORKFLOW CANVAS            │  INSPECTOR    │
│  (w-80)        │     (flex-1)                   │  (w-96)       │
│                │                                │               │
│  [Search]      │  ┌─────────────────────────┐   │  [Node Config]│
│                │  │                         │   │               │
│  AGENTS        │  │   [Node]    [Node]      │   │  Model        │
│  [Agent Card]  │  │      \    /             │   │  Temperature  │
│  [Agent Card]  │  │       [Node]            │   │  System Prompt│
│                │  │        |                 │   │               │
│  TOOLS         │  │      [Output]           │   │  [Update]     │
│  [Tool Card]   │  │                         │   │               │
│  [Tool Card]   │  └─────────────────────────┘   │               │
│                │                                │               │
│  LOGIC         │  [THE DECK - Control Bar]      │               │
│  [Logic Card]  │                                │               │
│                │                                │               │
├────────────────┴────────────────────────────────┴───────────────┤
│  TERMINAL DRAWER (h-40, collapsible)                            │
│  [System Log] [Clear] [Copy]                                    │
│  [14:02:41] [SYSTEM] Initializing...                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Iconography

WorkerBee uses Material Symbols Outlined for all icons.

### Common Icons

| Icon | Symbol | Usage |
|------|--------|-------|
| Play | `play_arrow` | Execute workflow |
| Add | `add` | Add new node |
| Settings | `settings` | Configuration |
| Search | `search` | Search functionality |
| Close | `close` | Close modal/panel |
| Edit | `edit` | Edit mode |
| Delete | `delete` | Delete action |
| Save | `save` | Save changes |
| Upload | `upload` | File upload |
| Download | `download` | File download |
| Agent | `smart_toy` | Agent nodes |
| Document | `description` | Document files |
| Data | `database` | Data sources |
| Code | `code` | Code execution |
| Terminal | `terminal` | Terminal/logs |
| Help | `help` | Help/documentation |
| User | `person` | User profile |
| Notification | `notifications` | Alerts |
| Menu | `menu` | Navigation menu |
| Expand | `expand_more` | Expand drawer |
| Collapse | `expand_less` | Collapse drawer |

---

## 5. Animation Guidelines

### 5.1 Transitions

| Element | Duration | Easing |
|---------|----------|--------|
| Button hover | 150ms | ease-out |
| Card hover | 200ms | cubic-bezier(0.25, 0.46, 0.45, 0.94) |
| Modal open/close | 300ms | ease-in-out |
| Drawer expand/collapse | 300ms | ease-in-out |
| Node connection animation | 1000ms | linear (infinite) |

### 5.2 Animations

#### Pulse Animation (Status Indicators)

```css
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
.animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

#### Cursor Blink (Terminal)

```css
@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
}
.cursor-blink {
    animation: blink 1s step-end infinite;
}
```

#### Connection Line Dash

```css
@keyframes dash {
    0% { stroke-dashoffset: 24; }
    100% { stroke-dashoffset: 0; }
}
.connection-line-active {
    stroke-dasharray: 6 6;
    animation: dash 1s linear infinite;
}
```

---

## 6. Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / Small desktop |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Large desktop |

### Responsive Behavior

- **Mobile (< 640px)**: Single column layout, collapsible sidebar, full-width inspector as modal
- **Tablet (640px - 1024px)**: Collapsible sidebar, inspector as slide-over panel
- **Desktop (> 1024px)**: Full three-panel layout with persistent sidebar and inspector

---

## 7. Accessibility Guidelines

### 7.1 Color Contrast

- All text meets WCAG 2.1 AA contrast requirements
- Espresso on Ceramic: 9.8:1 (AAA)
- Tungsten on Ceramic: 4.6:1 (AA)
- Amber on Espresso: 5.2:1 (AA)

### 7.2 Focus States

All interactive elements must have visible focus indicators:

```css
:focus-visible {
    outline: 2px solid #DDAA44;
    outline-offset: 2px;
}
```

### 7.3 Interactive Elements

- Minimum touch target: 44x44px
- Buttons have clear hover and active states
- Form inputs have associated labels
- Icons have aria-labels when standalone

---

## 8. Implementation Notes

### 8.1 Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                ceramic: '#EBE8E3',
                'ceramic-dark': '#F7F5F0',
                plastic: '#FDFCF9',
                espresso: '#3E3430',
                'espresso-dark': '#2C2420',
                tungsten: '#8C8682',
                amber: '#DDAA44',
                'amber-light': '#E4AD3F',
                'signal-green': '#6B9E78',
                'signal-red': '#CC5544',
                'tinted-paper': '#F2F0EB',
            },
            fontFamily: {
                display: ['Space Grotesk', 'sans-serif'],
                body: ['IBM Plex Sans', 'sans-serif'],
                mono: ['IBM Plex Mono', 'monospace'],
            },
            boxShadow: {
                lift: '0 8px 24px -4px rgba(62, 52, 48, 0.12), 0 2px 6px -1px rgba(62, 52, 48, 0.04)',
                deep: '0 20px 40px -8px rgba(62, 52, 48, 0.2)',
                soft: '0 4px 12px rgba(62, 52, 48, 0.08)',
                inset: 'inset 0 2px 4px rgba(62, 52, 48, 0.05)',
                'inset-slot': 'inset 0 2px 4px rgba(62, 52, 48, 0.08)',
                glow: '0 0 12px rgba(221, 170, 68, 0.4)',
            },
            borderRadius: {
                sm: '8px',
                md: '12px',
                lg: '16px',
                xl: '24px',
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
    ],
}
```

### 8.2 CSS Custom Properties

```css
:root {
    /* Colors */
    --color-ceramic: #EBE8E3;
    --color-plastic: #FDFCF9;
    --color-espresso: #3E3430;
    --color-tungsten: #8C8682;
    --color-amber: #DDAA44;
    --color-signal-green: #6B9E78;
    --color-signal-red: #CC5544;
    
    /* Typography */
    --font-display: 'Space Grotesk', sans-serif;
    --font-body: 'IBM Plex Sans', sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
    
    /* Shadows */
    --shadow-lift: 0 8px 24px -4px rgba(62, 52, 48, 0.12);
    --shadow-deep: 0 20px 40px -8px rgba(62, 52, 48, 0.2);
    --shadow-inset: inset 0 2px 4px rgba(62, 52, 48, 0.05);
}
```

---

*Document Version: 1.0*
*Last Updated: 2026-02-20*
