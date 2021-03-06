import LensHubProxy from '@/abis/LensHubProxy.json'
import { gql, useMutation, useQuery } from '@apollo/client'
import AllowanceButton from './AllowanceButton'
import Uniswap from '@/components/Shared/Uniswap'
import { Button } from '@/components/UI/Button'
import AppContext from '@/utils/AppContext'
import { LensterCollectModule, LensterPost } from '@/types/lenstertypes'
import { CreateCollectBroadcastItemResult } from '@/types/lens'
import { BROADCAST_MUTATION } from '@/graphql/BroadcastMutation'
import { CashIcon } from '@heroicons/react/outline'
import omit from '@/lib/omit'
import splitSignature from '@/lib/splitSignature'
import React, { Dispatch, FC, useContext, useState } from 'react'
import toast from 'react-hot-toast'
import { CHAIN_ID, CONNECT_WALLET, ERROR_MESSAGE, ERRORS, LENSHUB_PROXY, RELAY_ON, WRONG_NETWORK } from 'src/constants'
import { useAccount, useBalance, useContractWrite, useNetwork, useSignTypedData } from 'wagmi'

import IndexStatus from '@/components/Shared/IndexStatus'
import Spinner from '../Spinner'
import { ethers } from 'ethers'

export const ALLOWANCE_SETTINGS_QUERY = gql`
	query ApprovedModuleAllowanceAmount($request: ApprovedModuleAllowanceAmountRequest!) {
		approvedModuleAllowanceAmount(request: $request) {
			currency
			module
			allowance
			contractAddress
		}
		enabledModuleCurrencies {
			name
			symbol
			decimals
			address
		}
	}
`

const CREATE_COLLECT_TYPED_DATA_MUTATION = gql`
	mutation CreateCollectTypedData($options: TypedDataOptions, $request: CreateCollectRequest!) {
		createCollectTypedData(options: $options, request: $request) {
			id
			expiresAt
			typedData {
				types {
					CollectWithSig {
						name
						type
					}
				}
				domain {
					name
					chainId
					version
					verifyingContract
				}
				value {
					nonce
					deadline
					profileId
					pubId
					data
				}
			}
		}
	}
`

interface Props {
	fund: LensterPost
	collectModule: LensterCollectModule
	setRevenue: Dispatch<number>
	revenue: number
}

const Fund: FC<Props> = ({ fund, collectModule, setRevenue, revenue }) => {
	const { currentUser, userSigNonce, setUserSigNonce } = useContext(AppContext)
	const [allowed, setAllowed] = useState<boolean>(true)
	const { activeChain } = useNetwork()
	const { data: account } = useAccount()
	const { isLoading: signLoading, signTypedDataAsync } = useSignTypedData({
		onError(error) {
			toast.error(error?.message)
		},
	})
	const { data: balanceData, isLoading: balanceLoading } = useBalance({
		addressOrName: currentUser?.ownedBy,
		token: collectModule?.amount?.asset?.address,
	})

	let hasAmount = false

	if (balanceData && parseFloat(balanceData?.formatted) < parseFloat(collectModule?.amount?.value)) {
		hasAmount = false
	} else {
		hasAmount = true
	}

	const { data: allowanceData, loading: allowanceLoading } = useQuery(ALLOWANCE_SETTINGS_QUERY, {
		variables: {
			request: {
				currencies: collectModule?.amount?.asset?.address,
				followModules: [],
				collectModules: collectModule?.type,
				referenceModules: [],
			},
		},
		fetchPolicy: 'no-cache',
		skip: !collectModule?.amount?.asset?.address || !currentUser,
		onCompleted(data) {
			setAllowed(data?.approvedModuleAllowanceAmount[0]?.allowance !== '0x00')
		},
	})

	const onCompleted = () => {
		setRevenue(revenue + parseFloat(collectModule?.amount?.value))
		toast.success('Transaction submitted successfully!')
	}

	const {
		data: writeData,
		isLoading: writeLoading,
		write,
	} = useContractWrite(
		{
			addressOrName: LENSHUB_PROXY,
			contractInterface: LensHubProxy,
		},

		'collectWithSig',
		{
			overrides: { value: ethers.utils.parseEther("0.001") },
			onSuccess() {
				onCompleted()
			},
			
			onError(error: any) {
				console.log(error)
				toast.error(error?.data?.message ?? error?.message)
			},
		}
	)

	const [broadcast, { data: broadcastData, loading: broadcastLoading }] = useMutation(BROADCAST_MUTATION, {
		fetchPolicy: 'no-cache',
		onCompleted(data) {
			if (data?.broadcast?.reason !== 'NOT_ALLOWED') {
				onCompleted()
			}
		},
		onError(error) {
			if (error.message === ERRORS.notMined) {
				toast.error(error.message)
			}
		},
	})
	const [createCollectTypedData, { loading: typedDataLoading }] = useMutation(CREATE_COLLECT_TYPED_DATA_MUTATION, {
		fetchPolicy: 'no-cache',
		onCompleted({ createCollectTypedData }: { createCollectTypedData: CreateCollectBroadcastItemResult }) {
			const { id, typedData } = createCollectTypedData
			signTypedDataAsync({
				domain: omit(typedData?.domain, '__typename'),
				types: omit(typedData?.types, '__typename'),
				value: omit(typedData?.value, '__typename'),
			}).then(signature => {
				setUserSigNonce(userSigNonce + 1)
				const { profileId, pubId, data: collectData } = typedData?.value
				const { v, r, s } = splitSignature(signature)
				const sig = { v, r, s, deadline: typedData.value.deadline }
				const inputStruct = {
					collector: account?.address,
					profileId,
					pubId,
					data: collectData,
					sig,
				}
				if (RELAY_ON) {
					broadcast({ variables: { request: { id, signature } } }).then(({ data, errors }) => {
						if (errors || data?.broadcast?.reason === 'NOT_ALLOWED') {
							write({ args: inputStruct })
						}
					})
				} else {
					write({ args: inputStruct })
				}
			})
		},
		onError(error) {
			console.log(error)
			toast.error(error.message ?? ERROR_MESSAGE)
		},
	})

	const createCollect = () => {
		if (!account?.address) {
			toast.error(CONNECT_WALLET)
		} else if (activeChain?.id !== CHAIN_ID) {
			toast.error(WRONG_NETWORK)
		} else {
			createCollectTypedData({
				variables: {
					request: { publicationId: fund.id },
				},
			})
		}
	}

	return allowanceLoading || balanceLoading ? (
		<div className="w-24 rounded-lg h-[34px] shimmer" />
	) : allowed ? (
		<div className="flex items-center mt-3 space-y-0 space-x-3 sm:block sm:mt-0 sm:space-y-2">
			{hasAmount ? (
				<>
					<Button
						className="sm:mt-0 sm:ml-auto"
						onClick={createCollect}
						disabled={!hasAmount || typedDataLoading || signLoading || writeLoading || broadcastLoading}
						variant="success"
						icon={
							typedDataLoading || signLoading || writeLoading || broadcastLoading ? (
								<Spinner />
							) : (
								<CashIcon className="w-4 h-4" />
							)
						}
					>
						Fund
					</Button>
					{writeData?.hash ?? broadcastData?.broadcast?.txHash ? (
						<div className="mt-2">
							<IndexStatus
								txHash={writeData?.hash ? writeData?.hash : broadcastData?.broadcast?.txHash}
							/>
						</div>
					) : null}
				</>
			) : (
				<Uniswap module={collectModule} />
			)}
		</div>
	) : (
		<AllowanceButton
			title="Allow"
			module={allowanceData?.approvedModuleAllowanceAmount[0]}
			allowed={allowed}
			setAllowed={setAllowed}
		/>
	)
}

export default Fund
