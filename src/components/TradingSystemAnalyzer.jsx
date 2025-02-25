import React, { useState } from 'react';

const TradingSystemAnalyzer = () => {
  const [isReactUsed] = useState(true);
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

  // Update handleInputChange so that the select value (drawdownType) isn’t parsed as a number
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

    // Use setTimeout to prevent UI freezing during calculation
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

      // For non-compounding, fixed risk amount equals avgLoss
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

      // Variables for tracking prop firm rules
      let dayCount = 1; // Start with day 1
      let tradeInDay = 0;
      let dayStartBalance = initialBalance;
      let dailyPnL = 0;
      let isAccountBlown = false;
      // For daily loss breach tracking (separate from overall drawdown)
      let dailyLossBreaches = 0;
      // For trailing drawdown, we no longer use cumulative totalDrawdown.
      let consecutiveLossDays = 0;
      let maxConsecutiveLossDays = 0;
      let actualTradesTaken = 0; // Count actual trades taken

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
        // We flag a drawdown breach when the allowed minimum is crossed
        maxDrawdownBreach: false,
        // Optionally, you can record the allowed minimum for the day
        allowedMinimum: null,
      };

      // Run simulation trade-by-trade
      for (let i = 0; i < numberOfTrades; i++) {
        // If in prop firm mode and account is already blown, skip further trades
        if (isPropFirm && isAccountBlown) {
          continue;
        }

        actualTradesTaken++;

        // Determine win or loss
        const tradeNumber = actualTradesTaken;
        const isWin = Math.random() * 100 < winRate;
        let tradeResult = 0;

        if (isWin) {
          const profit = fixedRiskAmount * riskRewardRatio;
          balance += profit;
          profits += profit;
          winCount++;
          tradeResult = profit;
          if (isPropFirm) {
            dailyPnL += profit;
          }
        } else {
          balance -= fixedRiskAmount;
          losses += fixedRiskAmount;
          lossCount++;
          tradeResult = -fixedRiskAmount;
          if (isPropFirm) {
            dailyPnL -= fixedRiskAmount;
          }
        }

        // Log trade details
        currentDayLog.trades.push({
          tradeNumber,
          isWin,
          amount: tradeResult,
          balanceAfter: balance,
        });

        // Track equity curve
        equity.push(balance);

        // Check for break-even trade (when balance crosses or equals the initial balance)
        if (
          breakEvenTrade === -1 &&
          balance >= initialBalance &&
          equity[equity.length - 2] < initialBalance
        ) {
          breakEvenTrade = i;
        }

        // Update peak balance and calculate current drawdown (as percentage from peak)
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

        // Check overall drawdown rule for prop firm mode
        if (isPropFirm) {
          let allowedMinimum;
          if (drawdownType === 'fixed') {
            // Fixed (non-trailing): allowed equity must not drop below initial minus fixed dollar loss
            allowedMinimum = initialBalance - inputs.fixedDrawdownLimit;
          } else if (drawdownType === 'trailingUntilInitial') {
            // If the account has not yet exceeded the initial balance,
            // use a fixed limit relative to the initial balance.
            // Otherwise, use a trailing calculation.
            if (peakBalance <= initialBalance) {
              allowedMinimum =
                initialBalance - initialBalance * (maxDrawdown / 100);
            } else {
              allowedMinimum = peakBalance * (1 - maxDrawdown / 100);
            }
          } else {
            // Trailing: allowed minimum is always based on the current peak
            allowedMinimum = peakBalance * (1 - maxDrawdown / 100);
          }
          // Save the allowed minimum in the day log for reference
          currentDayLog.allowedMinimum = allowedMinimum;

          // Check if current balance breaches the allowed minimum
          if (balance < allowedMinimum) {
            isAccountBlown = true;
            currentDayLog.maxDrawdownBreach = true;
          }
        }

        // Increment trades in the current day if prop firm mode applies
        if (isPropFirm && tradesPerDay > 0) {
          tradeInDay++;
        }

        // Daily loss check (stops trading for the day if loss exceeds maxDailyLoss)
        if (isPropFirm && dailyPnL < 0) {
          const dailyLossPercent = (Math.abs(dailyPnL) / dayStartBalance) * 100;
          if (dailyLossPercent > maxDailyLoss) {
            dailyLossBreaches++;
            currentDayLog.dailyLossBreach = true;
            // Halt trading for the day
            tradeInDay = tradesPerDay;
            // Track consecutive loss days
            consecutiveLossDays++;
            if (consecutiveLossDays > maxConsecutiveLossDays) {
              maxConsecutiveLossDays = consecutiveLossDays;
            }
          }
        }

        // End-of-day logic: if the day's trade count has been reached
        if (isPropFirm && tradesPerDay > 0 && tradeInDay >= tradesPerDay) {
          // For days without a daily loss breach, you might optionally want to
          // update some metrics here.
          if (dailyPnL >= 0) {
            consecutiveLossDays = 0;
          }

          // Finalize current day log
          currentDayLog.endBalance = balance;
          currentDayLog.dailyPnL = dailyPnL;
          currentDayLog.dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;
          dailyLogs.push({ ...currentDayLog });

          // Reset daily trackers for next day
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

      // Process remaining day if there are trades left in the last day
      if (isPropFirm && tradesPerDay > 0 && currentDayLog.trades.length > 0) {
        // Finalize the current day log
        currentDayLog.endBalance = balance;
        currentDayLog.dailyPnL = dailyPnL;
        currentDayLog.dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;
        dailyLogs.push({ ...currentDayLog });
      }

      // Calculate expectancy and average trade metrics
      const probWin = winRate / 100;
      const probLoss = 1 - probWin;
      const expectancy = probWin * avgWin - probLoss * avgLoss;
      const averageTradeAmount =
        actualTradesTaken > 0 ? (profits - losses) / actualTradesTaken : 0;
      const averageTradePercent = (averageTradeAmount / accountSize) * 100;
      const totalReturn = ((balance - accountSize) / accountSize) * 100;
      const netProfit = balance - accountSize;

      // Find the day (if any) that had a drawdown breach
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
            // Include the drawdown settings for reference:
            drawdownType: drawdownType,
            fixedDrawdownLimit:
              drawdownType === 'fixed' ? inputs.fixedDrawdownLimit : null,
            maxDrawdownAllowed:
              drawdownType !== 'fixed'
                ? maxDrawdown
                : `${formatCurrency(initialBalance - (initialBalance - inputs.fixedDrawdownLimit))} (Fixed)`,
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

      <div className="mb-6 bg-[#2a2a2a] p-4 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-[#00ffe3]">
          Trading Parameters
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Average Win ($)
            </label>
            <input
              type="number"
              name="avgWin"
              value={inputs.avgWin}
              onChange={handleInputChange}
              min="1"
              step="1"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Average Loss ($)
            </label>
            <input
              type="number"
              name="avgLoss"
              value={inputs.avgLoss}
              onChange={handleInputChange}
              min="1"
              step="1"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Win Rate (%)
            </label>
            <input
              type="number"
              name="winRate"
              value={inputs.winRate}
              onChange={handleInputChange}
              min="1"
              max="99"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Account Size ($)
            </label>
            <input
              type="number"
              name="accountSize"
              value={inputs.accountSize}
              onChange={handleInputChange}
              min="100"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Number of Trades
            </label>
            <input
              type="number"
              name="numberOfTrades"
              value={inputs.numberOfTrades}
              onChange={handleInputChange}
              min="1"
              max="10000"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white focus:outline-none focus:ring-2 focus:ring-[#4a6cf7]"
            />
          </div>
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
              <label
                htmlFor="propFirmCheckbox"
                className="ml-2 block text-sm font-medium text-gray-400"
              >
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
                  <option value="trailingUntilInitial">
                    Trailing Until Initial
                  </option>
                  <option value="fixed">Fixed (Non-Trailing)</option>
                </select>
              </div>
              {inputs.drawdownType === 'fixed' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Fixed Drawdown Limit ($) (e.g., 1000 for a \$10,000 account with 10% limit)
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
                    Max Drawdown Allowed (%)
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
        className={`mt-4 ${
          isLoading ? 'bg-gray-600' : 'bg-[#4a6cf7] hover:bg-opacity-90'
        } text-white px-4 py-2 rounded transition-colors w-full md:w-auto`}
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

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-[#3a3a3a] p-4 rounded-lg">
              <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">
                Performance Metrics
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Starting Balance:</span>
                  <span className="font-medium font-white">
                    {formatCurrency(inputs.accountSize)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Final Balance:</span>
                  <span className="font-medium font-white">
                    {formatCurrency(results.finalBalance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Net Profit:</span>
                  <span
                    className={`font-medium ${
                      results.netProfit >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(results.netProfit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fixed Risk Amount:</span>
                  <span className="font-medium font-white">
                    {formatCurrency(results.fixedRiskAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Risk-Reward Ratio:</span>
                  <span className="font-medium font-white">
                    {results.riskRewardRatio.toFixed(2)}:1
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Risk per Trade (%):</span>
                  <span className="font-medium font-white">
                    {results.riskPercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Wins / Losses:</span>
                  <span className="font-medium font-white">
                    {results.winCount} / {results.lossCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Trades Taken:</span>
                  <span className="font-medium font-white">
                    {results.actualTradesTaken} of {inputs.numberOfTrades}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#3a3a3a] p-4 rounded-lg">
              <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">
                Risk Analysis
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Max Drawdown (Peak-to-Trough):</span>
                  <span className="font-medium text-red-600">
                    {results.maxDrawdown.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">System Expectancy:</span>
                  <span
                    className={`font-medium ${
                      results.expectancy >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {results.expectancy.toFixed(2)}$
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Average Trade Amount:</span>
                  <span
                    className={`font-medium ${
                      results.averageTradeAmount >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(results.averageTradeAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg Trade (% of initial):</span>
                  <span
                    className={`font-medium ${
                      results.averageTradePercent >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {results.averageTradePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Return:</span>
                  <span
                    className={`font-medium ${
                      results.totalReturn >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {results.totalReturn.toFixed(2)}%
                  </span>
                </div>

                {results.propFirmStats && (
                  <>
                    <div className="pt-2 border-t border-gray-200 mt-2">
                      <span className="font-medium text-blue-600">
                        Prop Firm Analysis:
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Daily Loss Allowed:</span>
                      <span className="font-medium text-white">
                        {results.propFirmStats.maxDailyLoss}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Drawdown Type:</span>
                      <span className="font-medium text-white">
                        {results.propFirmStats.drawdownType}
                      </span>
                    </div>
                    {results.propFirmStats.drawdownType === 'fixed' && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Fixed Drawdown Limit:</span>
                        <span className="font-medium text-white">
                          {formatCurrency(inputs.fixedDrawdownLimit)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-400">Daily Loss Breaches:</span>
                      <span className="font-medium text-red-600">
                        {results.propFirmStats.dailyLossBreaches}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Consecutive Loss Days:</span>
                      <span className="font-medium text-white">
                        {results.propFirmStats.maxConsecutiveLossDays}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Trading Days:</span>
                      <span className="font-medium text-white">
                        {results.propFirmStats.actualDaysCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Trades Taken:</span>
                      <span className="font-medium text-white">
                        {results.propFirmStats.actualTradeCount} of {inputs.numberOfTrades}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Trades Per Day:</span>
                      <span className="font-medium text-white">
                        {results.propFirmStats.avgTradesPerDay.toFixed(1)}
                        <span className="text-xs text-gray-500 ml-1">
                          (Target: {results.propFirmStats.tradesPerDayTarget})
                        </span>
                      </span>
                    </div>
                    {inputs.showBreachDetails && results.propFirmStats.breachDay && (
                      <div className="mt-4 border-t border-gray-200 pt-2">
                        <div className="font-medium text-red-600 mb-2">
                          Drawdown Breach Details:
                        </div>
                        <div className="mb-1">
                          <span className="text-gray-400">
                            Day when breach occurred:{' '}
                          </span>
                          <span className="font-medium text-white">
                            Day {results.propFirmStats.breachDay.day}
                          </span>
                        </div>
                        <div className="mb-1">
                          <span className="text-gray-400">
                            Balance at breach:{' '}
                          </span>
                          <span
                            className={`font-medium ${
                              results.propFirmStats.breachDay.dailyPnL >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {formatCurrency(results.propFirmStats.breachDay.endBalance)}
                          </span>
                        </div>
                        <div className="text-gray-400 mt-2 mb-1 text-sm">
                          Allowed Minimum on breach day: {formatCurrency(results.propFirmStats.breachDay.allowedMinimum)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">
              Equity Curve
            </h3>
            <div className="w-full h-64 bg-[#3a3a3a] relative p-2 border border-gray-600 rounded">
              {results.equity.length > 1 && (
                <svg
                  viewBox={`0 0 ${results.equity.length} 100`}
                  className="w-full h-full"
                >
                  {(() => {
                    const minEquity = Math.min(...results.equity);
                    const maxEquity = Math.max(...results.equity);
                    const range = maxEquity - minEquity || 1;
                    const normalize = (val) =>
                      100 - ((val - minEquity) / range) * 95;

                    let path = `M 0 ${normalize(results.equity[0])}`;
                    for (let i = 1; i < results.equity.length; i++) {
                      path += ` L ${i} ${normalize(results.equity[i])}`;
                    }

                    // Break-even line based on initial balance
                    const initialBalanceLine = `M 0 ${normalize(
                      inputs.accountSize
                    )} L ${results.equity.length} ${normalize(inputs.accountSize)}`;

                    return (
                      <>
                        <path
                          d={path}
                          fill="none"
                          stroke="#4a6cf7"
                          strokeWidth="0.5"
                        />
                        <path
                          d={initialBalanceLine}
                          fill="none"
                          stroke="rgba(0, 255, 227, 0.7)"
                          strokeWidth="0.6"
                          strokeDasharray="0.5,0.5"
                        />
                        <text
                          x="5"
                          y={normalize(inputs.accountSize) - 3}
                          fontSize="3"
                          fill="green"
                        >
                          Break-even Line
                        </text>
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">
              Drawdown Chart
            </h3>
            <div className="w-full h-48 bg-[#3a3a3a] relative p-2 border border-gray-600 rounded">
              {results.drawdowns.length > 0 && (
                <svg
                  viewBox={`0 0 ${results.drawdowns.length} 100`}
                  className="w-full h-full"
                >
                  {(() => {
                    const maxDrawdownVal = Math.max(...results.drawdowns, 5);
                    const normalize = (val) => (val / maxDrawdownVal) * 95;

                    let path = `M 0 ${normalize(results.drawdowns[0])}`;
                    for (let i = 1; i < results.drawdowns.length; i++) {
                      path += ` L ${i} ${normalize(results.drawdowns[i])}`;
                    }

                    return (
                      <>
                        <path
                          d={path}
                          fill="none"
                          stroke="#ff4136"
                          strokeWidth="0.5"
                        />
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingSystemAnalyzer;
