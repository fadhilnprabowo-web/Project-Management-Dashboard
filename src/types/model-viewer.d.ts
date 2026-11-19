import type React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        'ios-src'?: string
        alt?: string
        'camera-controls'?: boolean
        'touch-action'?: string
        ar?: boolean
        'ar-modes'?: string
        'ar-scale'?: string
        'shadow-intensity'?: string
      }
    }
  }
}

export {}
