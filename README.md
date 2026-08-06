<div align="center">

# 🖋️ Scriptive

<img src="public/images/logo.png" alt="Scriptive Logo" width="160" />

### Transform digital text into organic, human-like handwriting instantly.

[![Version](https://img.shields.io/badge/Version-2.0.1-indigo.svg?style=flat-square)](CHANGELOG.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-blue.svg?style=flat-square)](SECURITY.md)

</div>

---

## 🎨 What is Scriptive?

**Scriptive** is a high-performance web application that leverages procedural rendering and local computer vision to convert typed text into realistic, organic handwriting. 

It introduces a custom **Image-Based Glyph Stitching Engine** that draws individual transparent character PNG assets (supporting multiple variants per letter) directly onto the canvas. It also features horizontal spacing variation, baseline jitter, and composite multiply ink blending to make digital notes indistinguishable from real handwriting.

### 🌟 Key Features

- **Custom Image-Based Glyph Stitching**: Renders handwriting by drawing pre-cropped character PNGs (`ctx.drawImage`) instead of static digital fonts, ensuring maximum realism.
- **Multi-Variant Glyph Support**: Dynamically cycles through 3 different visual variations for every letter, preventing identical character repetition.
- **Dynamic Kerning & Word Wrapping**: Measures exact cropped bounding box dimensions of character assets to determine natural spacing and line-wraps inside paper margins.
- **Ink & Paper Blending**: Employs `multiply` composite blending so ink pigments naturally merge with ruled notebook lines and paper fiber textures.
- **Aesthetic Customization**: A premium, warm Pinterest-inspired minimalist layout with control over baseline jitter, pressure, ink tint colors, and smudge effects.
- **Local & Secure**: All image extraction (Connected Component Analysis + Otsu's thresholding) is performed locally in your browser.

---

## 🚀 Quick Start

Get your local handwriting workshop running in less than 2 minutes:

1. **Clone the Repository**

    ```bash
    git clone https://github.com/preetikaanjana/Scriptive.git
    cd Scriptive
    ```

2. **Install Dependencies**

    ```bash
    npm install
    ```

3. **Environment Configuration**
   Copy `.env.example` to `.env` and add your [OpenRouter](https://openrouter.ai/) API key.

4. **Fire it Up!**
    ```bash
    npm run dev
    ```

---

## 🛠️ Technical Architecture

<div align="center">

![React](https://skillicons.dev/icons?i=react)
![Vite](https://skillicons.dev/icons?i=vite)
![TailwindCSS](https://skillicons.dev/icons?i=tailwind)
![JavaScript](https://skillicons.dev/icons?i=js)
![HTML](https://skillicons.dev/icons?i=html)
![CSS](https://skillicons.dev/icons?i=css)

</div>

| Layer          | Technology                                                                                  |
| :------------- | :------------------------------------------------------------------------------------------ |
| **Framework**  | [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)                                 |
| **Styling**    | [Tailwind CSS](https://tailwindcss.com/) (Standardized Utility System)                      |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) (Global Orchestration)                      |
| **State**      | [Zustand](https://github.com/pmndrs/zustand) (Store & Persist)                              |
| **Rendering**  | [html2canvas](https://html2canvas.hertzen.com/) + [jsPDF](https://parall.ax/products/jspdf) |

---

## 📱 Connect with Me

I'd love to hear your feedback or discuss potential collaborations!

<div align="center">

[![GitHub](https://skillicons.dev/icons?i=github)](https://github.com/preetikaanjana)
[![LinkedIn](https://skillicons.dev/icons?i=linkedin)](https://www.linkedin.com/in/preetikaanjana/)
[![Twitter](https://skillicons.dev/icons?i=twitter)](https://x.com/preetikaanjana)
[![Gmail](https://skillicons.dev/icons?i=gmail)](mailto:preetikaanjana@gmail.com)

</div>

---

<p align="center">
  Built with ❤️ by <strong>Preetika Anjana</strong>
</p>
