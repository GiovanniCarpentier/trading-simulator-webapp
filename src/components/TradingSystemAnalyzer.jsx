import React, { useState } from 'react';

const TradingSystemAnalyzer = () => {
  // Function to format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const [inputs, setInputs] = useState({
    avgWin: 200,
    avgLoss: 100,
    winRate: 50,
    accountSize: 10000,
    numberOfTrades: 100,
    isPropFirm: false,
    // For trailing drawdown types:
    maxDrawdown: 10, // in percent (used for trailing modes)
    // For daily loss limit (separate from overall drawdown)
    maxDailyLoss: 2,
    tradesPerDay: 5,
    showBreachDetails: true,
    // NEW: drawdown type selector and fixed drawdown input
    // Options for drawdownType: 'trailing', 'trailingUntilInitial', 'fixed'
    drawdownType: 'trailing',
    fixedDrawdownLimit: 1000, // in dollars; used if drawdownType === 'fixed'
  });

  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle input changes (ensuring select values are not parsed as numbers)
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setInputs({
        ...inputs,
        [name]: checked,
      });
    } else if (name === 'drawdownType') {
      setInputs({
        ...inputs,
        [name]: value,
      });
    } else {
      setInputs({
        ...inputs,
        [name]: parseFloat(value),
      });
    }
  };

  const runSimulation = () => {
    setIsLoading(true);

    // Offload calculation with setTimeout
    setTimeout(() => {
      const {
        avgWin,
        avgLoss,
        winRate,
        accountSize,
        numberOfTrades,
        isPropFirm,
        maxDrawdown,
        maxDailyLoss,
        tradesPerDay,
        drawdownType,
      } = inputs;

      // Calculate risk-reward ratio and risk percentage (non-compounding)
      const riskRewardRatio = avgWin / avgLoss;
      const riskPercentage = (avgLoss / accountSize) * 100;

      // For non-compounding, the fixed risk amount equals avgLoss.
      const initialBalance = accountSize;
      const fixedRiskAmount = initialBalance * (riskPercentage / 100);

      let balance = initialBalance;
      let equity = [balance];
      let drawdowns = [];
      let currentDrawdown = 0;
      let maxDrawdownInSim = 0;
      let peakBalance = balance;
      let winCount = 0;
      let lossCount = 0;
      let profits = 0;
      let losses = 0;
      let breakEvenTrade = -1;

      // Variables for prop firm rules
      let dayCount = 1; // start at day 1
      let tradeInDay = 0;
      let dayStartBalance = initialBalance;
      let dailyPnL = 0;
      let isAccountBlown = false;
      let dailyLossBreaches = 0;
      let consecutiveLossDays = 0;
      let maxConsecutiveLossDays = 0;
      let actualTradesTaken = 0; // count actual trades taken

      // For trailingUntilInitial, persist the allowed minimum across trades.
      // fixedLoss is calculated based on initialBalance and maxDrawdown%
      const fixedLoss = initialBalance * (maxDrawdown / 100);
      let persistentAllowedMinimum = undefined; 
      if (isPropFirm && drawdownType === 'trailingUntilInitial') {
        persistentAllowedMinimum = initialBalance - fixedLoss;
      }

      // Track daily performance for breach analysis
      let dailyLogs = [];
      let currentDayLog = {
        day: 1,
        trades: [],
        startBalance: initialBalance,
        endBalance: initialBalance,
        dailyPnL: 0,
        dailyPnLPercent: 0,
        dailyLossBreach: false,
        maxDrawdownBreach: false,
        allowedMinimum: null,
      };

      // Run simulation trade-by-trade
      for (let i = 0; i < numberOfTrades; i++) {
        if (isPropFirm && isAccountBlown) {
          continue;
        }
        actualTradesTaken++;

        // Determine win or loss for this trade
        const tradeNumber = actualTradesTaken;
        const isWin = Math.random() * 100 < winRate;
        let tradeResult = 0;

        if (isWin) {
          const profit = fixedRiskAmount * riskRewardRatio;
          balance += profit;
          profits += profit;
          winCount++;
          tradeResult = profit;
          if (isPropFirm) dailyPnL += profit;
        } else {
          balance -= fixedRiskAmount;
          losses += fixedRiskAmount;
          lossCount++;
          tradeResult = -fixedRiskAmount;
          if (isPropFirm) dailyPnL -= fixedRiskAmount;
        }

        // Log trade details
        currentDayLog.trades.push({
          tradeNumber,
          isWin,
          amount: tradeResult,
          balanceAfter: balance,
        });
        equity.push(balance);

        // Detect break-even trade (when balance crosses the initial balance)
        if (
          breakEvenTrade === -1 &&
          balance >= initialBalance &&
          equity[equity.length - 2] < initialBalance
        ) {
          breakEvenTrade = i;
        }

        // Update peak balance and compute current drawdown from the peak
        if (balance > peakBalance) {
          peakBalance = balance;
          currentDrawdown = 0;
        } else {
          currentDrawdown = ((peakBalance - balance) / peakBalance) * 100;
          if (currentDrawdown > maxDrawdownInSim) {
            maxDrawdownInSim = currentDrawdown;
          }
        }
        drawdowns.push(currentDrawdown);

        // For prop firm rules, determine the allowed minimum balance
        if (isPropFirm) {
          let allowedMinimum;
          if (drawdownType === 'fixed') {
            // Fixed: allowed minimum remains constant
            allowedMinimum = initialBalance - inputs.fixedDrawdownLimit;
          } else if (drawdownType === 'trailingUntilInitial') {
            // Update the persistent allowed minimum if a new peak is reached.
            // It cannot be lower than (initialBalance - fixedLoss) nor exceed the initial balance.
            let potentialAllowed = peakBalance - fixedLoss;
            if (potentialAllowed > initialBalance) {
              potentialAllowed = initialBalance;
            }
            persistentAllowedMinimum = Math.max(persistentAllowedMinimum, potentialAllowed);
            allowedMinimum = persistentAllowedMinimum;
          } else {
            // Trailing: always use the current peak
            allowedMinimum = peakBalance * (1 - maxDrawdown / 100);
          }
          currentDayLog.allowedMinimum = allowedMinimum;

          // Check if the current balance breaches the allowed minimum
          if (balance < allowedMinimum) {
            isAccountBlown = true;
            currentDayLog.maxDrawdownBreach = true;
          }
        }

        // Increment trades in the current day (if in prop firm mode)
        if (isPropFirm && tradesPerDay > 0) {
          tradeInDay++;
        }

        // Daily loss check: halt trading for the day if loss exceeds maxDailyLoss
        if (isPropFirm && dailyPnL < 0) {
          const dailyLossPercent = (Math.abs(dailyPnL) / dayStartBalance) * 100;
          if (dailyLossPercent > maxDailyLoss) {
            dailyLossBreaches++;
            currentDayLog.dailyLossBreach = true;
            tradeInDay = tradesPerDay; // force end-of-day
            consecutiveLossDays++;
            if (consecutiveLossDays > maxConsecutiveLossDays) {
              maxConsecutiveLossDays = consecutiveLossDays;
            }
          }
        }

        // End-of-day: if the day's trade count has been reached
        if (isPropFirm && tradesPerDay > 0 && tradeInDay >= tradesPerDay) {
          if (dailyPnL >= 0) {
            consecutiveLossDays = 0;
          }
          currentDayLog.endBalance = balance;
          currentDayLog.dailyPnL = dailyPnL;
          currentDayLog.dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;
          dailyLogs.push({ ...currentDayLog });

          dayCount++;
          tradeInDay = 0;
          dayStartBalance = balance;
          dailyPnL = 0;
          currentDayLog = {
            day: dayCount,
            trades: [],
            startBalance: balance,
            endBalance: balance,
            dailyPnL: 0,
            dailyPnLPercent: 0,
            dailyLossBreach: false,
            maxDrawdownBreach: false,
            allowedMinimum: null,
          };
        }
      }

      // Process any remaining trades in the final day
      if (isPropFirm && tradesPerDay > 0 && currentDayLog.trades.length > 0) {
        currentDayLog.endBalance = balance;
        currentDayLog.dailyPnL = dailyPnL;
        currentDayLog.dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;
        dailyLogs.push({ ...currentDayLog });
      }

      // Calculate expectancy and average trade metrics
      const probWin = winRate / 100;
      const probLoss = 1 - probWin;
      const expectancy = probWin * avgWin - probLoss * avgLoss;
      const averageTradeAmount = actualTradesTaken > 0 ? (profits - losses) / actualTradesTaken : 0;
      const averageTradePercent = (averageTradeAmount / accountSize) * 100;
      const totalReturn = ((balance - accountSize) / accountSize) * 100;
      const netProfit = balance - accountSize;

      // Find the day (if any) when a drawdown breach occurred
      const breachDay = dailyLogs.find((day) => day.maxDrawdownBreach);

      // Set prop firm stats (if applicable)
      const propFirmStats = isPropFirm
        ? {
            maxDailyLoss: maxDailyLoss,
            tradesPerDayTarget: tradesPerDay,
            dailyLossBreaches: dailyLossBreaches,
            maxConsecutiveLossDays: maxConsecutiveLossDays,
            actualTradeCount: actualTradesTaken,
            actualDaysCount: dayCount,
            avgTradesPerDay: dayCount > 0 ? actualTradesTaken / dayCount : 0,
            dailyLogs: dailyLogs,
            breachDay: breachDay,
            drawdownType: drawdownType,
            fixedDrawdownLimit: drawdownType === 'fixed' ? inputs.fixedDrawdownLimit : null,
          }
        : null;

      setResults({
        finalBalance: balance,
        maxDrawdown: maxDrawdownInSim,
        expectancy,
        averageTradeAmount,
        averageTradePercent,
        totalReturn,
        netProfit,
        equity,
        drawdowns,
        winCount,
        lossCount,
        fixedRiskAmount,
        breakEvenTrade,
        riskRewardRatio,
        riskPercentage,
        propFirmStats,
        isPropFirm,
        actualTradesTaken,
      });
      setIsLoading(false);
    }, 0);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 bg-[#1a1a1a] rounded-lg shadow">
      <h1 className="text-2xl font-bold text-center mb-6 text-white">
        Trading System Analyzer (Non-Compounding)
      </h1>
      {/* (Form and result rendering remain largely unchanged) */}
      <div className="mb-6 bg-[#2a2a2a] p-4 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-[#00ffe3]">
          Trading Parameters
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* ... your input fields ... */}
          <div className="md:col-span-2">
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id="propFirmCheckbox"
                name="isPropFirm"
                checked={inputs.isPropFirm}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="propFirmCheckbox" className="ml-2 block text-sm font-medium text-gray-400">
                Enable Prop Firm Rules
              </label>
            </div>
          </div>
          {inputs.isPropFirm && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Drawdown Limit Type
                </label>
                <select
                  name="drawdownType"
                  value={inputs.drawdownType}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
                >
                  <option value="trailing">Trailing</option>
                  <option value="trailingUntilInitial">Trailing Until Initial</option>
                  <option value="fixed">Fixed (Non-Trailing)</option>
                </select>
              </div>
              {inputs.drawdownType === 'fixed' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Fixed Drawdown Limit ($) (e.g., 1000 for a $10,000 account with 10% limit)
                  </label>
                  <input
                    type="number"
                    name="fixedDrawdownLimit"
                    value={inputs.fixedDrawdownLimit}
                    onChange={handleInputChange}
                    min="1"
                    className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Max Drawdown Allowed (%) (applies as a fixed loss from the initial account until profit is high enough)
                  </label>
                  <input
                    type="number"
                    name="maxDrawdown"
                    value={inputs.maxDrawdown}
                    onChange={handleInputChange}
                    min="0.1"
                    max="100"
                    step="0.1"
                    className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Max Daily Loss Allowed (%) (set to 100% if no daily limit)
                </label>
                <input
                  type="number"
                  name="maxDailyLoss"
                  value={inputs.maxDailyLoss}
                  onChange={handleInputChange}
                  min="0.1"
                  max="100"
                  step="0.1"
                  className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Trades Per Day
                </label>
                <input
                  type="number"
                  name="tradesPerDay"
                  value={inputs.tradesPerDay}
                  onChange={handleInputChange}
                  min="1"
                  max="100"
                  className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Show Breach Details
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showBreachDetailsCheckbox"
                    name="showBreachDetails"
                    checked={inputs.showBreachDetails}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-xs text-gray-500">
                    (Shows details when drawdown limit is exceeded)
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <button
        onClick={runSimulation}
        disabled={isLoading}
        className={`mt-4 ${isLoading ? 'bg-gray-600' : 'bg-[#4a6cf7] hover:bg-opacity-90'} text-white px-4 py-2 rounded transition-colors w-full md:w-auto`}
      >
        {isLoading ? 'Running Simulation...' : 'Run Simulation'}
      </button>
      {results && (
        <div className="bg-[#2a2a2a] p-4 rounded-lg shadow-sm mt-6">
          <h2 className="text-xl font-semibold mb-4 text-[#00ffe3]">
            Simulation Results
            {results.isPropFirm && (
              <span className="ml-2 text-sm font-normal text-[#4a6cf7]">
                (Prop Firm Rules Applied)
              </span>
            )}
          </h2>
          {/* (Display of performance metrics, charts, etc. remains unchanged) */}
        </div>
      )}
    </div>
  );
};

export default TradingSystemAnalyzer;
