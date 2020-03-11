import {
  h, VNode,
  BaseComponent,
  DateProfile,
  ComponentContext,
  createDuration,
  startOfDay,
  asRoughMs,
  formatIsoTimeString,
  addDurations,
  wholeDivideDurations,
  Duration,
  createFormatter,
  RefMap,
  CssDimValue,
  createRef,
  PositionCache,
  DateMarker,
  DateEnv,
  ComponentContextType
} from '@fullcalendar/core'
import TimeColsSlatsCoords from './TimeColsSlatsCoords'


export interface TimeColsSlatsProps extends TimeColsSlatsContentProps {
  clientWidth: CssDimValue
  minHeight: CssDimValue
  tableMinWidth: CssDimValue
  tableColGroupNode: VNode
  onCoords?: (coords: TimeColsSlatsCoords | null) => void
}

interface TimeColsSlatsContentProps {
  dateProfile: DateProfile
  axis: boolean
  slatMetas: TimeSlatMeta[]
}


// potential nice values for the slot-duration and interval-duration
// from largest to smallest
const STOCK_SUB_DURATIONS = [
  { hours: 1 },
  { minutes: 30 },
  { minutes: 15 },
  { seconds: 30 },
  { seconds: 15 }
]

/*
for the horizontal "slats" that run width-wise. Has a time axis on a side. Depends on RTL.
*/


export default class TimeColsSlats extends BaseComponent<TimeColsSlatsProps> {

  private rootElRef = createRef<HTMLDivElement>()
  private slatElRefs = new RefMap<HTMLTableRowElement>()


  render(props: TimeColsSlatsProps, state: {}, context: ComponentContext) {
    let { theme } = context

    return (
      <div class='fc-timegrid-slats' ref={this.rootElRef}>
        <table
          class={theme.getClass('table') + ' vgrow' /* why not use rowsGrow like resource view? */}
          style={{
            minWidth: props.tableMinWidth,
            width: props.clientWidth,
            height: props.minHeight
          }}
        >
          {props.tableColGroupNode /* relies on there only being a single <col> for the axis */}
          <TimeColsSlatsBody
            slatElRefs={this.slatElRefs}
            axis={props.axis}
            slatMetas={props.slatMetas}
            dateProfile={props.dateProfile}
          />
        </table>
      </div>
    )
  }


  componentDidMount() {
    this.updateSizing()
  }


  componentDidUpdate() {
    this.updateSizing()
  }


  componentWillUnmount() {
    if (this.props.onCoords) {
      this.props.onCoords(null)
    }
  }


  updateSizing() {
    let { props } = this

    if (props.onCoords && props.clientWidth) { // clientWidth means sizing has stabilized
      props.onCoords(
        new TimeColsSlatsCoords(
          new PositionCache(
            this.rootElRef.current,
            this.slatElRefs.collect(),
            false,
            true // vertical
          ),
          props.dateProfile,
          props.slatMetas
        )
      )
    }
  }

}


export interface TimeColsSlatsBodyProps extends TimeColsSlatsContentProps {
  slatElRefs: RefMap<HTMLTableRowElement>
}


export class TimeColsSlatsBody extends BaseComponent<TimeColsSlatsBodyProps> {

  render(props: TimeColsSlatsBodyProps, state: {}, context: ComponentContext) {
    let { slatElRefs } = props

    return (
      <tbody>
        {props.slatMetas.map((slatMeta, i) => (
          <tr ref={slatElRefs.createRef(i)}>
            {props.axis &&
              <TimeColsAxisCell {...slatMeta} />
            }
            <td
              className={'fc-time' + (!slatMeta.isLabeled ? ' fc-minor' : '')}
              data-time={slatMeta.isoTimeStr}
            />
          </tr>
        ))}
      </tbody>
    )
  }

}


const DEFAULT_SLAT_LABEL_FORMAT = {
  hour: 'numeric',
  minute: '2-digit',
  omitZeroMinute: true,
  meridiem: 'short'
}

export function TimeColsAxisCell(props: TimeSlatMeta) {
  let classNames = [ 'fc-time', props.isLabeled ? 'shrink' : 'fc-minor', 'fc-axis' ]

  return (
    <ComponentContextType.Consumer>
      {(context: ComponentContext) => {
        let labelFormat = createFormatter(context.options.slotLabelFormat || DEFAULT_SLAT_LABEL_FORMAT) // TODO: optimize!!!

        return (
          <td class={classNames.join(' ')} data-time={props.isoTimeStr}>
            {props.isLabeled &&
              <div data-fc-width-all={1}>
                <span data-fc-width-content={1}>
                  {context.dateEnv.format(props.date, labelFormat)}
                </span>
              </div>
            }
          </td>
        )
      }}
    </ComponentContextType.Consumer>
  )
}


export function getSlatLabelFormat(optionInput) {
  return createFormatter(optionInput || {
    hour: 'numeric',
    minute: '2-digit',
    omitZeroMinute: true,
    meridiem: 'short'
  })
}


export interface TimeSlatMeta {
  date: DateMarker
  isoTimeStr: string
  isLabeled: boolean
}

export function buildSlatMetas(dateProfile: DateProfile, labelIntervalInput, slotDuration: Duration, dateEnv: DateEnv) {
  let dayStart = startOfDay(dateProfile.renderRange.start)
  let slatTime = dateProfile.minTime
  let slatIterator = createDuration(0)
  let labelInterval = getLabelInterval(labelIntervalInput, slotDuration)
  let metas: TimeSlatMeta[] = []

  while (asRoughMs(slatTime) < asRoughMs(dateProfile.maxTime)) {
    let date = dateEnv.add(dayStart, slatTime)
    let isLabeled = wholeDivideDurations(slatIterator, labelInterval) !== null

    metas.push({
      date,
      isoTimeStr: formatIsoTimeString(date),
      isLabeled
    })

    slatTime = addDurations(slatTime, slotDuration)
    slatIterator = addDurations(slatIterator, slotDuration)
  }

  return metas
}


function getLabelInterval(optionInput, slotDuration: Duration) {

  // might be an array value (for TimelineView).
  // if so, getting the most granular entry (the last one probably).
  if (Array.isArray(optionInput)) {
    optionInput = optionInput[optionInput.length - 1]
  }

  return optionInput ?
    createDuration(optionInput) :
    computeLabelInterval(slotDuration)
}


// Computes an automatic value for slotLabelInterval
function computeLabelInterval(slotDuration) {
  let i
  let labelInterval
  let slotsPerLabel

  // find the smallest stock label interval that results in more than one slots-per-label
  for (i = STOCK_SUB_DURATIONS.length - 1; i >= 0; i--) {
    labelInterval = createDuration(STOCK_SUB_DURATIONS[i])
    slotsPerLabel = wholeDivideDurations(labelInterval, slotDuration)
    if (slotsPerLabel !== null && slotsPerLabel > 1) {
      return labelInterval
    }
  }

  return slotDuration // fall back
}

TimeColsSlats.addPropsEquality({
  onReceiveSlatEls: true
})