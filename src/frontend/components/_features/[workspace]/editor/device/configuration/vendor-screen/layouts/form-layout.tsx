import { RefreshIcon } from '@root/frontend/assets/icons/interface/Refresh'
import { Label } from '@root/frontend/components/_atoms/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@root/frontend/components/_atoms/select'
import { ToggleSwitch } from '@root/frontend/components/_atoms/toggle-switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@root/frontend/components/_atoms/tooltip'
import { boardSelectors } from '@root/frontend/hooks/use-store-selectors'
import { useOpenPLCStore } from '@root/frontend/store'
import { evalVisible, type VisibleCondition } from '@root/frontend/utils/vpp/eval-visible'
import { getSectionPersistenceKey } from '@root/frontend/utils/vpp/persistence-keys'
import { useDevice } from '@root/middleware/shared/providers/platform-context'
import { type MouseEvent, useCallback, useRef, useState } from 'react'

import type { ScreenSection } from '../index'

type FieldDef = {
  id: string
  label: string
  type: string
  default?: unknown
  min?: number
  max?: number
  step?: number
  unit?: string
  help?: string
  options?: string[] | Array<{ value: string; label: string }>
  placeholder?: string
  fallbackLabel?: string
  maxLength?: number
  validation?: string
  visible?: VisibleCondition
}

// Shared input styling for every <input> branch (text, number, password,
// ip-address, mac-address). Keeping it in one place avoids style drift
// when new field types land.
const TEXT_INPUT_CLASS =
  'flex h-[30px] w-48 items-center rounded-md border border-neutral-100 bg-white px-2 py-1 font-caption text-cp-sm font-medium text-neutral-850 outline-none focus:border-brand-medium-dark dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'

// Anchor-less HTML5 patterns for the formatted text types. The schema's
// per-field `validation` (when present) is more specific and wins via the
// runtime override below, but these defaults give a sensible UX hint when
// the screen author didn't ship a regex.
const IPV4_PATTERN = '^(\\d{1,3}\\.){3}\\d{1,3}$'
const MAC_PATTERN = '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$'
const COMMUNICATION_PORT_FALLBACK_VALUE = '__use_communication_port__'

type FormLayoutProps = {
  section: ScreenSection
}

// Small "info" glyph that reveals the field's help text on hover.
function FieldHelpIcon({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label='Field help'
          className='inline-flex h-3.5 w-3.5 cursor-help select-none items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600 focus:outline-none focus-visible:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300'
        >
          <svg viewBox='0 0 16 16' fill='none' className='h-3.5 w-3.5'>
            <circle cx='8' cy='8' r='7' stroke='currentColor' strokeWidth='1.5' />
            <path d='M8 7.25v4.25' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
            <circle cx='8' cy='4.75' r='0.85' fill='currentColor' />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent side='right' align='start' sideOffset={6} className='text-xs'>
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

function FormLayout({ section }: FormLayoutProps) {
  const fields = (section.fields ?? []) as FieldDef[]

  const device = useDevice()
  const availableCommunicationPorts = boardSelectors.useAvailableCommunicationPorts()
  const setAvailableOptions = boardSelectors.useSetAvailableOptions()
  const portsReqIdRef = useRef<number>(0)
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false)

  const [isDiscoveringJwplc, setIsDiscoveringJwplc] = useState(false)
  const [jwplcDiscoveryResults, setJwplcDiscoveryResults] = useState<
    Array<{
      ipAddress: string
      port: number
      label: string
      interfaceName: string
      sourceAddress: string
      discoveryType: 'jwplc-native' | 'modbus-tcp'
      isJwplc: boolean
      vendor?: string
      model?: string
      macAddress?: string
      networkMode?: string
    }>
  >([])
  const [jwplcDiscoveryError, setJwplcDiscoveryError] = useState<string | null>(null)
  const [hasJwplcDiscoverySearched, setHasJwplcDiscoverySearched] = useState(false)

  const vendorScreenData = useOpenPLCStore((s) => s.deviceDefinitions.configuration.vendorScreenData)
  const setVendorScreenData = useOpenPLCStore((s) => s.deviceActions.setVendorScreenData)
  // Single-source-of-truth for the per-section storage key — see
  // `getSectionPersistenceKey` in ../index.tsx.  Every layout that
  // persists must derive its key through this helper so the
  // editor's dirty-tracking sees the same keys the layouts write.
  const persistenceKey = getSectionPersistenceKey(section)

  const storedValues =
    persistenceKey !== null
      ? (vendorScreenData?.[persistenceKey] as Record<string, string | number | boolean> | undefined)
      : undefined
  const values: Record<string, string | number | boolean> = {}
  for (const field of fields) {
    values[field.id] = storedValues?.[field.id] ?? (field.default as string | number | boolean) ?? ''
  }

  const updateField = (id: string, value: string | number | boolean) => {
    if (persistenceKey === null) return
    setVendorScreenData(persistenceKey, { ...storedValues, [id]: value })
  }

  const updateFields = (updates: Record<string, string | number | boolean>) => {
    if (persistenceKey === null) return
    setVendorScreenData(persistenceKey, { ...storedValues, ...updates })
  }

  const refreshCommunicationPorts = useCallback(
    async (e?: MouseEvent<HTMLButtonElement>) => {
      e?.preventDefault()
      if (isRefreshingPorts) return

      try {
        setIsRefreshingPorts(true)

        portsReqIdRef.current += 1
        const currentReqId = portsReqIdRef.current

        const ports = await device.refreshCommunicationPorts()

        if (currentReqId === portsReqIdRef.current) {
          setAvailableOptions({ availableCommunicationPorts: ports })
        }
      } catch (error: unknown) {
        console.error(error)
      } finally {
        setIsRefreshingPorts(false)
      }
    },
    [device, setAvailableOptions, isRefreshingPorts],
  )

  const discoverJwplcDevices = useCallback(
    async (e?: MouseEvent<HTMLButtonElement>) => {
      e?.preventDefault()
      if (isDiscoveringJwplc) return

      try {
        setIsDiscoveringJwplc(true)
        setJwplcDiscoveryError(null)
        setJwplcDiscoveryResults([])
        setHasJwplcDiscoverySearched(true)

        const result = await device.discoverJwplcDevices()

        if (!result.success) {
          setJwplcDiscoveryError(result.error ?? 'No se pudo buscar dispositivos JWPLC.')
          return
        }

        setJwplcDiscoveryResults(result.devices ?? [])
      } catch (error: unknown) {
        console.error(error)
        setJwplcDiscoveryError(error instanceof Error ? error.message : 'Error buscando dispositivos JWPLC.')
      } finally {
        setIsDiscoveringJwplc(false)
      }
    },
    [device, isDiscoveringJwplc],
  )

  return (
    <TooltipProvider>
      <div className='flex flex-col gap-3'>
        {fields.map((field) => {
          // Honor the field's conditional-visibility clause. Fields with
          // no `visible` clause always render.
          if (!evalVisible(field.visible, values)) return null
          // DOM id must be unique across the whole screen — sections can
          // reuse a field id (e.g. both modbus_rtu and modbus_tcp own an
          // `enabled` field). Scope by section.id so a label's `htmlFor`
          // can't target a same-named control in another section.
          const fieldDomId = `vendor-field-${section.id}-${field.id}`
          return (
            <div key={field.id} className='flex items-center gap-4'>
              {field.type === 'boolean' ? (
                <>
                  <Label
                    htmlFor={fieldDomId}
                    className='min-w-32 shrink-0 whitespace-nowrap text-xs text-neutral-950 dark:text-white'
                  >
                    {field.label}
                  </Label>
                  <ToggleSwitch
                    id={fieldDomId}
                    checked={values[field.id] === true}
                    onCheckedChange={(checked) => updateField(field.id, checked)}
                    aria-label={field.label}
                  />
                  {field.help && <FieldHelpIcon text={field.help} />}
                </>
              ) : (
                <>
                  <Label className='min-w-32 shrink-0 whitespace-nowrap text-xs text-neutral-950 dark:text-white'>
                    {field.label}
                  </Label>
                  {field.type === 'number' ? (
                    <div className='flex items-center gap-1'>
                      <input
                        type='number'
                        value={String(values[field.id] ?? '')}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        onChange={(e) => updateField(field.id, Number(e.target.value))}
                        className='flex h-[30px] w-24 items-center rounded-md border border-neutral-100 bg-white px-2 py-1 font-caption text-cp-sm font-medium text-neutral-850 outline-none focus:border-brand-medium-dark dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'
                      />
                      {field.unit && (
                        <span className='text-xs text-neutral-500 dark:text-neutral-400'>{field.unit}</span>
                      )}
                    </div>
                  ) : field.type === 'jwplc-device-discovery' ? (
                    <div className='flex max-w-[520px] flex-col gap-2'>
                      <div className='flex items-center gap-2'>
                        <button
                          type='button'
                          onClick={discoverJwplcDevices}
                          disabled={isDiscoveringJwplc}
                          className='inline-flex h-[30px] items-center justify-center rounded-md border border-neutral-100 bg-white px-3 py-1 font-caption text-cp-sm font-medium text-neutral-850 outline-none hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900'
                        >
                          {isDiscoveringJwplc ? 'Buscando dispositivos...' : 'Buscar JWPLC en la red'}
                        </button>

                        {jwplcDiscoveryResults.length > 0 && (
                          <span className='text-xs text-neutral-500 dark:text-neutral-400'>
                            {jwplcDiscoveryResults.length === 1
                              ? '1 dispositivo encontrado'
                              : jwplcDiscoveryResults.length + ' dispositivos encontrados'}
                          </span>
                        )}
                      </div>

                      {jwplcDiscoveryError && <span className='text-xs text-red-500'>{jwplcDiscoveryError}</span>}

                      {jwplcDiscoveryResults.length > 0 && (
                        <div className='flex flex-col gap-1'>
                          {jwplcDiscoveryResults.map((foundDevice) => {
                            const isDhcpEnabled = values.enable_dhcp === true
                            const title = foundDevice.isJwplc
                              ? foundDevice.model || 'JWPLC Basic confirmado'
                              : 'Equipo Modbus TCP detectado'
                            const badgeText = foundDevice.isJwplc ? 'JWPLC confirmado' : 'Solo puerto 502'
                            const networkInfo = [
                              foundDevice.macAddress ? 'MAC ' + foundDevice.macAddress : null,
                              foundDevice.networkMode,
                              foundDevice.interfaceName,
                            ]
                              .filter(Boolean)
                              .join(' ? ')

                            return (
                              <div
                                key={foundDevice.ipAddress + ':' + foundDevice.port}
                                className='flex items-center gap-2 rounded-md border border-neutral-100 px-2 py-2 dark:border-neutral-850'
                              >
                                <div className='min-w-0 flex-1'>
                                  <div className='flex items-center gap-2'>
                                    <span className='truncate text-xs font-medium text-neutral-800 dark:text-neutral-200'>
                                      {title}
                                    </span>
                                    <span
                                      className={
                                        foundDevice.isJwplc
                                          ? 'rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                          : 'rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                      }
                                    >
                                      {badgeText}
                                    </span>
                                  </div>

                                  <div className='mt-0.5 text-xs text-neutral-600 dark:text-neutral-400'>
                                    {foundDevice.ipAddress}:{foundDevice.port}
                                  </div>

                                  {networkInfo && (
                                    <div className='mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-500'>
                                      {networkInfo}
                                    </div>
                                  )}
                                </div>

                                <button
                                  type='button'
                                  onClick={() => {
                                    if (isDhcpEnabled) {
                                      updateFields({ tcp_debug_ip_address: foundDevice.ipAddress })
                                      return
                                    }

                                    updateFields({
                                      tcp_debug_ip_address: foundDevice.ipAddress,
                                      ip_address: foundDevice.ipAddress,
                                    })
                                  }}
                                  className='inline-flex h-[26px] shrink-0 items-center justify-center rounded-md bg-brand px-2 font-caption text-xs font-medium text-white hover:opacity-90'
                                >
                                  Usar para Debug
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {!isDiscoveringJwplc &&
                        hasJwplcDiscoverySearched &&
                        jwplcDiscoveryResults.length === 0 &&
                        !jwplcDiscoveryError && (
                          <span className='text-xs text-amber-500'>
                            No se encontraron dispositivos. Verifica que el JWPLC est? encendido, conectado a la red y
                            con Modbus TCP activo.
                          </span>
                        )}

                      {!isDiscoveringJwplc && !hasJwplcDiscoverySearched && !jwplcDiscoveryError && (
                        <span className='text-xs text-neutral-400 dark:text-neutral-500'>
                          Busca JWPLC Basic por discovery nativo. Si no responde, se usa respaldo por Modbus TCP puerto
                          502.
                        </span>
                      )}

                      {values.enable_dhcp === true && !String(values.tcp_debug_ip_address ?? '').trim() && (
                        <span className='text-[11px] text-neutral-400 dark:text-neutral-500'>
                          Con DHCP activo, usa Discovery o escribe la IP asignada en Debug IP Address.
                        </span>
                      )}
                    </div>
                  ) : field.type === 'communication-port' ? (
                    <div className='flex items-center gap-1'>
                      <Select
                        value={
                          String(values[field.id] ?? '').trim()
                            ? String(values[field.id])
                            : COMMUNICATION_PORT_FALLBACK_VALUE
                        }
                        onValueChange={(v) => updateField(field.id, v === COMMUNICATION_PORT_FALLBACK_VALUE ? '' : v)}
                      >
                        <SelectTrigger
                          aria-label={field.label}
                          placeholder={field.placeholder ?? 'Select communication port'}
                          withIndicator
                          className='flex h-[30px] w-48 items-center justify-between gap-1 rounded-md border border-neutral-100 bg-white px-2 py-1 font-caption text-cp-sm font-medium text-neutral-850 outline-none data-[state=open]:border-brand-medium-dark dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'
                        />
                        <SelectContent
                          className='h-fit max-h-[200px] w-[--radix-select-trigger-width] overflow-y-auto rounded-lg border border-neutral-100 bg-white outline-none drop-shadow-lg dark:border-brand-medium-dark dark:bg-neutral-950'
                          sideOffset={5}
                          position='popper'
                          align='center'
                          side='bottom'
                        >
                          <SelectItem
                            value={COMMUNICATION_PORT_FALLBACK_VALUE}
                            className='flex w-full cursor-pointer items-center px-2 py-[6px] outline-none hover:bg-neutral-200 dark:hover:bg-neutral-850'
                          >
                            <span className='font-caption text-cp-sm font-medium text-neutral-850 dark:text-neutral-300'>
                              {field.fallbackLabel ?? 'Use Communication Port'}
                            </span>
                          </SelectItem>

                          {availableCommunicationPorts.map((port) => {
                            const portAddress = String(port.address ?? '').trim()
                            const portName = String(port.name ?? '').trim()
                            if (!portAddress) return null

                            const displayName =
                              portName && portName !== portAddress ? `${portAddress} (${portName})` : portAddress

                            return (
                              <SelectItem
                                key={portAddress}
                                value={portAddress}
                                className='flex w-full cursor-pointer items-center px-2 py-[6px] outline-none hover:bg-neutral-200 dark:hover:bg-neutral-850'
                              >
                                <span className='font-caption text-cp-sm font-medium text-neutral-850 dark:text-neutral-300'>
                                  {displayName}
                                </span>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>

                      <button
                        type='button'
                        onClick={refreshCommunicationPorts}
                        disabled={isRefreshingPorts}
                        aria-label='Refresh debug ports'
                        className='inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-neutral-400 hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-500 dark:hover:text-neutral-300'
                      >
                        <RefreshIcon size='sm' className={isRefreshingPorts ? 'spin-refresh' : ''} />
                      </button>
                    </div>
                  ) : field.type === 'select' ? (
                    <Select value={String(values[field.id] ?? '')} onValueChange={(v) => updateField(field.id, v)}>
                      <SelectTrigger
                        aria-label={field.label}
                        placeholder='Select...'
                        withIndicator
                        className='flex h-[30px] w-48 items-center justify-between gap-1 rounded-md border border-neutral-100 bg-white px-2 py-1 font-caption text-cp-sm font-medium text-neutral-850 outline-none data-[state=open]:border-brand-medium-dark dark:border-neutral-850 dark:bg-neutral-950 dark:text-neutral-300'
                      />
                      <SelectContent
                        className='h-fit max-h-[200px] w-[--radix-select-trigger-width] overflow-y-auto rounded-lg border border-neutral-100 bg-white outline-none drop-shadow-lg dark:border-brand-medium-dark dark:bg-neutral-950'
                        sideOffset={5}
                        position='popper'
                        align='center'
                        side='bottom'
                      >
                        {(field.options ?? []).map((opt) => {
                          const value = typeof opt === 'string' ? opt : opt.value
                          const label = typeof opt === 'string' ? opt : opt.label
                          return (
                            <SelectItem
                              key={value}
                              value={value}
                              className='flex w-full cursor-pointer items-center px-2 py-[6px] outline-none hover:bg-neutral-200 dark:hover:bg-neutral-850'
                            >
                              <span className='font-caption text-cp-sm font-medium text-neutral-850 dark:text-neutral-300'>
                                {label}
                              </span>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'password' ? (
                    <input
                      type='password'
                      value={String(values[field.id] ?? '')}
                      onChange={(e) => updateField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      pattern={field.validation}
                      autoComplete='new-password'
                      className={TEXT_INPUT_CLASS}
                    />
                  ) : field.type === 'ip-address' ? (
                    <input
                      type='text'
                      inputMode='decimal'
                      value={String(values[field.id] ?? '')}
                      onChange={(e) => updateField(field.id, e.target.value)}
                      placeholder={field.placeholder ?? '0.0.0.0'}
                      maxLength={field.maxLength ?? 15}
                      pattern={field.validation ?? IPV4_PATTERN}
                      className={TEXT_INPUT_CLASS}
                    />
                  ) : field.type === 'mac-address' ? (
                    <input
                      type='text'
                      value={String(values[field.id] ?? '')}
                      onChange={(e) => updateField(field.id, e.target.value)}
                      placeholder={field.placeholder ?? 'AA:BB:CC:DD:EE:FF'}
                      maxLength={field.maxLength ?? 17}
                      pattern={field.validation ?? MAC_PATTERN}
                      className={TEXT_INPUT_CLASS}
                    />
                  ) : (
                    <input
                      type='text'
                      value={String(values[field.id] ?? '')}
                      onChange={(e) => updateField(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      pattern={field.validation}
                      className={TEXT_INPUT_CLASS}
                    />
                  )}
                  {field.help && <FieldHelpIcon text={field.help} />}
                </>
              )}
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

export { FormLayout }
