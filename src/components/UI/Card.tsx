import clsx from 'clsx'
import { FC, ReactNode } from 'react'

interface CardProps {
	children: ReactNode
	className?: string
	forceRounded?: boolean
}

export const Card: FC<CardProps> = ({ children, className = '', forceRounded = false }) => {
	return (
		<div className={clsx(forceRounded ? 'rounded-xl max-w-md' : 'rounded-none sm:rounded-xl', 'border bg-white', className)}>
			{children}
		</div>
	)
}

interface CardHeaderProps {
	children: ReactNode
	className?: string
}

export const CardHeader: FC<CardHeaderProps> = ({ children, className = '' }) => {
	return <div className={`border-b p-3 ${className}`}>{children}</div>
}

interface CardBodyProps {
	children?: ReactNode
	className?: string
}
export const CardBody: FC<CardBodyProps> = ({ children, className = '' }) => {
	return <div className={`p-5 ${className}`}>{children}</div>
}
