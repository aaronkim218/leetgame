// CSS module type declarations for web-only components
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

// Global CSS side-effect imports
declare module '*.css' {}
