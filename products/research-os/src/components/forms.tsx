import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
export { Button } from './ui'
export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`ui-input ${props.className || ''}`} />
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={`ui-input ${props.className || ''}`} />
export const Select = ({onValueChange,...props}: SelectHTMLAttributes<HTMLSelectElement> & {onValueChange?:(value:string)=>void}) => <select {...props} className={`ui-input ${props.className || ''}`} onChange={e=>{props.onChange?.(e);onValueChange?.(e.target.value)}} />
export const FormField = ({htmlFor,label,children}:{htmlFor:string;label:string;children:ReactNode}) => <div className="ui-field"><label htmlFor={htmlFor}>{label}</label>{children}</div>
