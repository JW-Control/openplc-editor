#if JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS
struct JWPLCRtuTimingStat
{
    uint32_t lastUs = 0;
    uint32_t maxUs = 0;
    uint64_t totalUs = 0;
    uint32_t count = 0;
};

static JWPLCRtuTimingStat jwplcTimingScanPeriod;
static JWPLCRtuTimingStat jwplcTimingServiceGap;
static JWPLCRtuTimingStat jwplcTimingFc02Rtt;
static JWPLCRtuTimingStat jwplcTimingFc02PollPeriod;
static JWPLCRtuTimingStat jwplcTimingInputToOutputUpdate;
static JWPLCRtuTimingStat jwplcTimingInputToRemoteQ;
static JWPLCRtuTimingStat jwplcTimingRemoteQToFc15;
static JWPLCRtuTimingStat jwplcTimingFc15Rtt;
static JWPLCRtuTimingStat jwplcTimingFc15Cycle;

static uint32_t jwplcTimingLastScanUs = 0;
static uint32_t jwplcTimingLastServiceUs = 0;
static uint32_t jwplcTimingFc02StartUs = 0;
static uint32_t jwplcTimingLastFc02StartUs = 0;
static uint32_t jwplcTimingFc15StartUs = 0;
static uint32_t jwplcTimingLastFc15StartUs = 0;
static uint32_t jwplcTimingInputChangeUs = 0;
static uint32_t jwplcTimingRemoteQChangeUs = 0;
static uint32_t jwplcTimingLastPrintMs = 0;

static bool jwplcTimingInputInitialized = false;
static bool jwplcTimingRemoteQInitialized = false;
static bool jwplcTimingPendingInputToOutputUpdate = false;
static bool jwplcTimingPendingInputToRemoteQ = false;
static bool jwplcTimingPendingRemoteQToFc15 = false;
static uint8_t jwplcTimingLastInputBits = 0;
static uint8_t jwplcTimingLastRemoteQBits = 0;

static uint32_t jwplcTimingInputChanges = 0;
static uint32_t jwplcTimingRemoteQChanges = 0;
static uint32_t jwplcTimingFc02Ok = 0;
static uint32_t jwplcTimingFc02Fail = 0;
static uint32_t jwplcTimingFc15Ok = 0;
static uint32_t jwplcTimingFc15Fail = 0;

static inline void jwplcTimingRecord(JWPLCRtuTimingStat &stat, uint32_t valueUs)
{
    stat.lastUs = valueUs;
    if (valueUs > stat.maxUs)
    {
        stat.maxUs = valueUs;
    }
    stat.totalUs += valueUs;
    ++stat.count;
}

static inline uint32_t jwplcTimingAverage(const JWPLCRtuTimingStat &stat)
{
    return stat.count == 0 ? 0U : (uint32_t)(stat.totalUs / stat.count);
}

static void jwplcTimingInit()
{
    // Durante este probe el Modbus RTU local/debugger de Serial0 debe estar OFF.
    // El Backplane sigue exclusivamente sobre Serial2.
    Serial.begin(115200);
    delay(20);
    Serial.println();
    Serial.println("[RTU-TIMING] alpha17 diagnostics enabled; keep local Modbus RTU/Serial0 OFF");
}

static void jwplcTimingOnScanStart()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastScanUs != 0)
    {
        jwplcTimingRecord(jwplcTimingScanPeriod, nowUs - jwplcTimingLastScanUs);
    }
    jwplcTimingLastScanUs = nowUs;
}

static void jwplcTimingOnService()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastServiceUs != 0)
    {
        jwplcTimingRecord(jwplcTimingServiceGap, nowUs - jwplcTimingLastServiceUs);
    }
    jwplcTimingLastServiceUs = nowUs;
}

static void jwplcTimingObserveRemoteInputs(uint8_t bits)
{
    if (!jwplcTimingInputInitialized)
    {
        jwplcTimingLastInputBits = bits;
        jwplcTimingInputInitialized = true;
        return;
    }

    if (bits == jwplcTimingLastInputBits)
    {
        return;
    }

    jwplcTimingLastInputBits = bits;
    jwplcTimingInputChangeUs = micros();
    jwplcTimingPendingInputToOutputUpdate = true;
    jwplcTimingPendingInputToRemoteQ = true;
    ++jwplcTimingInputChanges;
}

static void jwplcTimingOnOutputUpdate()
{
    if (!jwplcTimingPendingInputToOutputUpdate)
    {
        return;
    }

    jwplcTimingRecord(
        jwplcTimingInputToOutputUpdate,
        micros() - jwplcTimingInputChangeUs);
    jwplcTimingPendingInputToOutputUpdate = false;
}

static void jwplcTimingObserveRemoteOutputs(uint8_t bits)
{
    if (!jwplcTimingRemoteQInitialized)
    {
        jwplcTimingLastRemoteQBits = bits;
        jwplcTimingRemoteQInitialized = true;
        return;
    }

    if (bits == jwplcTimingLastRemoteQBits)
    {
        return;
    }

    const uint32_t nowUs = micros();
    jwplcTimingLastRemoteQBits = bits;
    jwplcTimingRemoteQChangeUs = nowUs;
    jwplcTimingPendingRemoteQToFc15 = true;
    ++jwplcTimingRemoteQChanges;

    if (jwplcTimingPendingInputToRemoteQ)
    {
        jwplcTimingRecord(jwplcTimingInputToRemoteQ, nowUs - jwplcTimingInputChangeUs);
        jwplcTimingPendingInputToRemoteQ = false;
    }
}

static void jwplcTimingOnFc15Accepted()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastFc15StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc15Cycle, nowUs - jwplcTimingLastFc15StartUs);
    }
    jwplcTimingLastFc15StartUs = nowUs;
    jwplcTimingFc15StartUs = nowUs;

    if (jwplcTimingPendingRemoteQToFc15)
    {
        jwplcTimingRecord(jwplcTimingRemoteQToFc15, nowUs - jwplcTimingRemoteQChangeUs);
        jwplcTimingPendingRemoteQToFc15 = false;
    }
}

static void jwplcTimingOnFc15Done(bool success)
{
    if (jwplcTimingFc15StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc15Rtt, micros() - jwplcTimingFc15StartUs);
        jwplcTimingFc15StartUs = 0;
    }

    if (success) ++jwplcTimingFc15Ok;
    else ++jwplcTimingFc15Fail;
}

static void jwplcTimingOnFc02Accepted()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastFc02StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc02PollPeriod, nowUs - jwplcTimingLastFc02StartUs);
    }
    jwplcTimingLastFc02StartUs = nowUs;
    jwplcTimingFc02StartUs = nowUs;
}

static void jwplcTimingOnFc02Done(bool success)
{
    if (jwplcTimingFc02StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc02Rtt, micros() - jwplcTimingFc02StartUs);
        jwplcTimingFc02StartUs = 0;
    }

    if (success) ++jwplcTimingFc02Ok;
    else ++jwplcTimingFc02Fail;
}

static void jwplcTimingMaybePrint()
{
    const uint32_t nowMs = millis();
    if ((uint32_t)(nowMs - jwplcTimingLastPrintMs) < 2000U)
    {
        return;
    }
    jwplcTimingLastPrintMs = nowMs;

    Serial.printf(
        "[RTU-TIMING] scan_us=%lu/%lu/%lu(n=%lu) service_gap_us=%lu/%lu/%lu(n=%lu) fc02_poll_us=%lu/%lu/%lu(n=%lu)\r\n",
        (unsigned long)jwplcTimingScanPeriod.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingScanPeriod),
        (unsigned long)jwplcTimingScanPeriod.maxUs,
        (unsigned long)jwplcTimingScanPeriod.count,
        (unsigned long)jwplcTimingServiceGap.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingServiceGap),
        (unsigned long)jwplcTimingServiceGap.maxUs,
        (unsigned long)jwplcTimingServiceGap.count,
        (unsigned long)jwplcTimingFc02PollPeriod.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc02PollPeriod),
        (unsigned long)jwplcTimingFc02PollPeriod.maxUs,
        (unsigned long)jwplcTimingFc02PollPeriod.count);

    Serial.printf(
        "[RTU-TIMING] fc02_rtt_us=%lu/%lu/%lu in2out_us=%lu/%lu/%lu in2q_us=%lu/%lu/%lu q2fc15_us=%lu/%lu/%lu fc15_rtt_us=%lu/%lu/%lu fc15_cycle_us=%lu/%lu/%lu changes_in=%lu changes_q=%lu ok/fail_fc02=%lu/%lu ok/fail_fc15=%lu/%lu\r\n",
        (unsigned long)jwplcTimingFc02Rtt.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc02Rtt),
        (unsigned long)jwplcTimingFc02Rtt.maxUs,
        (unsigned long)jwplcTimingInputToOutputUpdate.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingInputToOutputUpdate),
        (unsigned long)jwplcTimingInputToOutputUpdate.maxUs,
        (unsigned long)jwplcTimingInputToRemoteQ.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingInputToRemoteQ),
        (unsigned long)jwplcTimingInputToRemoteQ.maxUs,
        (unsigned long)jwplcTimingRemoteQToFc15.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingRemoteQToFc15),
        (unsigned long)jwplcTimingRemoteQToFc15.maxUs,
        (unsigned long)jwplcTimingFc15Rtt.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc15Rtt),
        (unsigned long)jwplcTimingFc15Rtt.maxUs,
        (unsigned long)jwplcTimingFc15Cycle.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc15Cycle),
        (unsigned long)jwplcTimingFc15Cycle.maxUs,
        (unsigned long)jwplcTimingInputChanges,
        (unsigned long)jwplcTimingRemoteQChanges,
        (unsigned long)jwplcTimingFc02Ok,
        (unsigned long)jwplcTimingFc02Fail,
        (unsigned long)jwplcTimingFc15Ok,
        (unsigned long)jwplcTimingFc15Fail);
}
#else
static inline void jwplcTimingInit() {}
static inline void jwplcTimingOnScanStart() {}
static inline void jwplcTimingOnService() {}
static inline void jwplcTimingObserveRemoteInputs(uint8_t) {}
static inline void jwplcTimingOnOutputUpdate() {}
static inline void jwplcTimingObserveRemoteOutputs(uint8_t) {}
static inline void jwplcTimingOnFc15Accepted() {}
static inline void jwplcTimingOnFc15Done(bool) {}
static inline void jwplcTimingOnFc02Accepted() {}
static inline void jwplcTimingOnFc02Done(bool) {}
static inline void jwplcTimingMaybePrint() {}
#endif
