import React, { useState } from 'react';

const TradingSystemAnalyzer = () => {
  // Function to format currency values.
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // State for inputs. Note the new simulationRuns field.
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
    // Drawdown type selector: 'trailing', 'trailingUntilInitial', or 'fixed'
    drawdownType: 'trailing',
    fixedDrawdownLimit: 1000, // in dollars; used if drawdownType === 'fixed'
    // New: number of simulation runs for fail rate estimation.
    simulationRuns: 1,
  });

  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle input changes.
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setInputs({ ...inputs, [name]: checked });
    } else if (name === 'drawdownType') {
      setInputs({ ...inputs, [name]: value });
    } else {
      setInputs({ ...inputs, [name]: parseFloat(value) });
    }
  };

  // Main simulation function.
  const runSimulation = () => {
    setIsLoading(true);

    // Offload simulation calculations.
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
        fixedDrawdownLimit,
        simulationRuns,
      } = inputs;

      // Helper function to run one simulation.
      const simulateOnce = () => {
        // Basic parameters.
        const riskRewardRatio = avgWin / avgLoss;
        const riskPercentage = (avgLoss / accountSize) * 100;
        const initialBalance = accountSize;
        // Non-compounding fixed risk equals avgLoss.
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

        // Variables for prop firm rules.
        let dayCount = 1;
        let tradeInDay = 0;
        let dayStartBalance = initialBalance;
        let dailyPnL = 0;
        let isAccountBlown = false;
        let dailyLossBreaches = 0;
        let consecutiveLossDays = 0;
        let maxConsecutiveLossDays = 0;
        let actualTradesTaken = 0;

        // For trailingUntilInitial, calculate fixed loss in dollars and set initial allowed minimum.
        const fixedLoss = initialBalance * (maxDrawdown / 100);
        let persistentAllowedMinimum =
          isPropFirm && drawdownType === 'trailingUntilInitial'
            ? initialBalance - fixedLoss
            : undefined;

        // Daily log for additional details.
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

        // Run simulation over trades.
        for (let i = 0; i < numberOfTrades; i++) {
          if (isPropFirm && isAccountBlown) {
            continue;
          }
          actualTradesTaken++;

          // Determine outcome.
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

          currentDayLog.trades.push({
            tradeNumber,
            isWin,
            amount: tradeResult,
            balanceAfter: balance,
          });
          equity.push(balance);

          // Break-even trade detection.
          if (
            breakEvenTrade === -1 &&
            balance >= initialBalance &&
            equity[equity.length - 2] < initialBalance
          ) {
            breakEvenTrade = i;
          }

          // Update peak and drawdown.
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

          // Prop firm drawdown check.
          if (isPropFirm) {
            let allowedMinimum;
            if (drawdownType === 'fixed') {
              allowedMinimum = initialBalance - fixedDrawdownLimit;
            } else if (drawdownType === 'trailingUntilInitial') {
              let potentialAllowed = peakBalance - fixedLoss;
              if (potentialAllowed > initialBalance) {
                potentialAllowed = initialBalance;
              }
              persistentAllowedMinimum = Math.max(persistentAllowedMinimum, potentialAllowed);
              allowedMinimum = persistentAllowedMinimum;
            } else {
              allowedMinimum = peakBalance * (1 - maxDrawdown / 100);
            }
            currentDayLog.allowedMinimum = allowedMinimum;
            if (balance < allowedMinimum) {
              isAccountBlown = true;
              currentDayLog.maxDrawdownBreach = true;
            }
          }

          // Increment trades in current day.
          if (isPropFirm && tradesPerDay > 0) {
            tradeInDay++;
          }

          // Daily loss check.
          if (isPropFirm && dailyPnL < 0) {
            const dailyLossPercent = (Math.abs(dailyPnL) / dayStartBalance) * 100;
            if (dailyLossPercent > maxDailyLoss) {
              dailyLossBreaches++;
              currentDayLog.dailyLossBreach = true;
              tradeInDay = tradesPerDay;
              consecutiveLossDays++;
              if (consecutiveLossDays > maxConsecutiveLossDays) {
                maxConsecutiveLossDays = consecutiveLossDays;
              }
            }
          }

          // End-of-day logic.
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

        // Process any remaining day.
        if (isPropFirm && tradesPerDay > 0 && currentDayLog.trades.length > 0) {
          currentDayLog.endBalance = balance;
          currentDayLog.dailyPnL = dailyPnL;
          currentDayLog.dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;
          dailyLogs.push({ ...currentDayLog });
        }

        // Compute additional metrics.
        const probWin = winRate / 100;
        const probLoss = 1 - probWin;
        const expectancy = probWin * avgWin - probLoss * avgLoss;
        const averageTradeAmount =
          actualTradesTaken > 0 ? (profits - losses) / actualTradesTaken : 0;
        const averageTradePercent = (averageTradeAmount / accountSize) * 100;
        const totalReturn = ((balance - accountSize) / accountSize) * 100;
        const netProfit = balance - initialBalance;

        const simulationResult = {
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
          propFirmStats: isPropFirm
            ? {
                maxDailyLoss,
                tradesPerDayTarget: tradesPerDay,
                dailyLossBreaches,
                maxConsecutiveLossDays,
                actualTradeCount: actualTradesTaken,
                actualDaysCount: dayCount,
                avgTradesPerDay: dayCount > 0 ? actualTradesTaken / dayCount : 0,
                dailyLogs,
                breachDay: dailyLogs.find((day) => day.maxDrawdownBreach),
                drawdownType,
                fixedDrawdownLimit: drawdownType === 'fixed' ? fixedDrawdownLimit : null,
              }
            : null,
          isPropFirm,
          actualTradesTaken,
          isAccountBlown,
        };

        return simulationResult;
      };

      // If prop firm mode is enabled and simulationRuns > 1, run multiple simulations.
      if (isPropFirm && simulationRuns > 1) {
        let failureCount = 0;
        for (let j = 0; j < simulationRuns; j++) {
          const result = simulateOnce();
          if (result.isAccountBlown) {
            failureCount++;
          }
        }
        const failRate = (failureCount / simulationRuns) * 100;
        setResults({
          simulationRuns,
          failureCount,
          failRate,
        });
      } else {
        // Otherwise, run a single simulation.
        const result = simulateOnce();
        setResults(result);
      }
      setIsLoading(false);
    }, 0);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 bg-[#2a2a2a] rounded-lg shadow py-4">
      <div className="p-6 md:p-8 rounded-2xl shadow-xl border border-gray-700 mb-10 mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#00ffe3] mb-6 text-center animate-fade-in">
              Trading System Analyzer
          </h2>

          <p className="text-base sm:text-lg text-gray-300 leading-relaxed text-center mb-6">
              A powerful simulation tool designed for traders to analyze their trading strategy, measure risk exposure, and evaluate performance under real-world conditions. Whether you’re an independent trader or preparing for a prop firm challenge, this tool helps refine your trading approach.
          </p>

          <div className="bg-gray-800/50 p-4 sm:p-6 rounded-xl shadow-md border border-gray-700">
              <h3 className="text-xl sm:text-2xl font-semibold text-[#00ffe3] mb-4 text-center">
                  Key Features
              </h3>
              <ul className="space-y-4 text-gray-300 text-sm sm:text-base">
                <li className="flex items-start space-x-3">
                  <span className="text-cyan-300 text-base sm:text-lg flex-shrink-0">⏳</span>
                  <div>
                    <strong className="block text-base sm:text-lg">Performance Simulation:</strong>
                    <span>Input parameters such as win rate, average win/loss, and number of trades to generate a simulated trading outcome.</span>
                  </div>
                </li>
                
                <li className="flex items-start space-x-3">
                  <span className="text-cyan-300 text-base sm:text-lg flex-shrink-0">📊</span>
                  <div>
                    <strong className="block text-base sm:text-lg">Risk Metrics & Equity Curve:</strong>
                    <span>View detailed statistics, including drawdowns, risk-reward ratio, and a real-time equity curve.</span>
                  </div>
                </li>
                
                <li className="flex items-start space-x-3">
                  <span className="text-cyan-300 text-base sm:text-lg flex-shrink-0">🏆</span>
                  <div>
                    <strong className="block text-base sm:text-lg">Prop Firm Evaluation:</strong>
                    <span>Customize drawdown limits for prop firm challenges, including fixed, trailing, and trailing until initial balance.</span>
                  </div>
                </li>
                
                <li className="flex items-start space-x-3">
                  <span className="text-cyan-300 text-base sm:text-lg flex-shrink-0">📉</span>
                  <div>
                    <strong className="block text-base sm:text-lg">Fail Rate Estimation:</strong>
                    <span>Simulate multiple trading sessions to determine the probability of breaching max drawdown limits.</span>
                  </div>
                </li>
              </ul>

          </div>

          <p className="text-base sm:text-lg text-gray-300 leading-relaxed text-center mt-6">
              Optimize your trading strategy by adjusting key parameters, visualizing risk, and improving your prop firm success rate.
          </p>

          <p className="text-base sm:text-lg text-gray-300 text-center mt-4">
              Get started below and simulate your trading performance with confidence!
          </p>
      </div>

      {/* Trading Simulation Form */}
      <div className="mb-6 bg-[#2a2a2a] p-4 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-[#00ffe3]">Trading Parameters</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Standard inputs */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Average Win ($)</label>
            <input
              type="number"
              name="avgWin"
              value={inputs.avgWin}
              onChange={handleInputChange}
              min="1"
              step="1"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Average Loss ($)</label>
            <input
              type="number"
              name="avgLoss"
              value={inputs.avgLoss}
              onChange={handleInputChange}
              min="1"
              step="1"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Win Rate (%)</label>
            <input
              type="number"
              name="winRate"
              value={inputs.winRate}
              onChange={handleInputChange}
              min="1"
              max="99"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Account Size ($)</label>
            <input
              type="number"
              name="accountSize"
              value={inputs.accountSize}
              onChange={handleInputChange}
              min="100"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Number of Trades</label>
            <input
              type="number"
              name="numberOfTrades"
              value={inputs.numberOfTrades}
              onChange={handleInputChange}
              min="1"
              max="10000"
              className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
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
              <label htmlFor="propFirmCheckbox" className="ml-2 block text-sm font-medium text-gray-400">
                Enable Prop Firm Rules
              </label>
            </div>
          </div>
          {inputs.isPropFirm && (
            <>
              {/* Prop firm specific settings */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Drawdown Limit Type</label>
                <select
                  name="drawdownType"
                  value={inputs.drawdownType}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
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
                    className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
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
                    className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
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
                  className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Trades Per Day</label>
                <input
                  type="number"
                  name="tradesPerDay"
                  value={inputs.tradesPerDay}
                  onChange={handleInputChange}
                  min="1"
                  max="100"
                  className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
                />
              </div>
              {/* New: Simulation Runs for Fail Rate Estimation */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Simulation Runs for Fail Rate Estimation (enter a value greater than 1 to estimate)
                </label>
                <input
                  type="number"
                  name="simulationRuns"
                  value={inputs.simulationRuns}
                  onChange={handleInputChange}
                  min="1"
                  max="10000"
                  step="1"
                  className="w-full p-2 border border-gray-600 rounded bg-[#3a3a3a] text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Show Breach Details</label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="showBreachDetailsCheckbox"
                    name="showBreachDetails"
                    checked={inputs.showBreachDetails}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-xs text-gray-500">(Shows details when drawdown limit is exceeded)</span>
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
          {inputs.isPropFirm && inputs.simulationRuns > 1 ? (
            <>
              <h2 className="text-xl font-semibold mb-4 text-[#00ffe3]">Prop Firm Fail Rate Estimation</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Simulation Runs:</span>
                  <span className="font-medium text-white">{results.simulationRuns}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Failures (Broke Max Drawdown):</span>
                  <span className="font-medium text-red-600">{results.failureCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Estimated Fail Rate:</span>
                  <span className="font-medium text-red-600">{results.failRate.toFixed(2)}%</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-4 text-[#00ffe3]">
                Simulation Results
                {results.isPropFirm && (
                  <span className="ml-2 text-sm font-normal text-[#4a6cf7]">(Prop Firm Rules Applied)</span>
                )}
              </h2>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="bg-[#3a3a3a] p-4 rounded-lg">
                  <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">Performance Metrics</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Starting Balance:</span>
                      <span className="font-medium text-white">{formatCurrency(inputs.accountSize)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Final Balance:</span>
                      <span className="font-medium text-white">{formatCurrency(results.finalBalance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Net Profit:</span>
                      <span className={`font-medium ${results.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(results.netProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Fixed Risk Amount:</span>
                      <span className="font-medium text-white">{formatCurrency(results.fixedRiskAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Risk-Reward Ratio:</span>
                      <span className="font-medium text-white">{results.riskRewardRatio.toFixed(2)}:1</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Risk per Trade (%):</span>
                      <span className="font-medium text-white">{results.riskPercentage.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Wins / Losses:</span>
                      <span className="font-medium text-white">{results.winCount} / {results.lossCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Trades Taken:</span>
                      <span className="font-medium text-white">{results.actualTradesTaken} of {inputs.numberOfTrades}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-[#3a3a3a] p-4 rounded-lg">
                  <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">Risk Analysis</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Drawdown (Peak-to-Trough):</span>
                      <span className="font-medium text-red-600">{results.maxDrawdown.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">System Expectancy:</span>
                      <span className={`font-medium ${results.expectancy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {results.expectancy.toFixed(2)}$
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Average Trade Amount:</span>
                      <span className={`font-medium ${results.averageTradeAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(results.averageTradeAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Trade (% of initial):</span>
                      <span className={`font-medium ${results.averageTradePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {results.averageTradePercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Return:</span>
                      <span className={`font-medium ${results.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
              {/* Equity Curve */}
              <div className="mb-6">
                <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">Equity Curve</h3>
                <div className="w-full h-64 bg-[#3a3a3a] relative p-2 border border-gray-600 rounded">
                  {results.equity.length > 1 && (
                    <svg viewBox={`0 0 ${results.equity.length} 100`} className="w-full h-full">
                      {(() => {
                        const minEquity = Math.min(...results.equity);
                        const maxEquity = Math.max(...results.equity);
                        const range = maxEquity - minEquity || 1;
                        const normalize = (val) => 100 - ((val - minEquity) / range) * 95;
                        let path = `M 0 ${normalize(results.equity[0])}`;
                        for (let i = 1; i < results.equity.length; i++) {
                          path += ` L ${i} ${normalize(results.equity[i])}`;
                        }
                        // Break-even line.
                        const initialBalanceLine = `M 0 ${normalize(inputs.accountSize)} L ${results.equity.length} ${normalize(inputs.accountSize)}`;
                        return (
                          <>
                            <path d={path} fill="none" stroke="#4a6cf7" strokeWidth="0.5" />
                            <path
                              d={initialBalanceLine}
                              fill="none"
                              stroke="rgba(0, 255, 227, 0.7)"
                              strokeWidth="0.6"
                              strokeDasharray="0.5,0.5"
                            />
                            <text x="5" y={normalize(inputs.accountSize) - 3} fontSize="3" fill="green">
                              Break-even Line
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  )}
                </div>
              </div>
              {/* Drawdown Chart */}
              <div>
                <h3 className="font-medium text-lg mb-2 text-[#00ffe3]">Drawdown Chart</h3>
                <div className="w-full h-48 bg-[#3a3a3a] relative p-2 border border-gray-600 rounded">
                  {results.drawdowns.length > 0 && (
                    <svg viewBox={`0 0 ${results.drawdowns.length} 100`} className="w-full h-full">
                      {(() => {
                        const maxDrawdownVal = Math.max(...results.drawdowns, 5);
                        const normalize = (val) => (val / maxDrawdownVal) * 95;
                        let path = `M 0 ${normalize(results.drawdowns[0])}`;
                        for (let i = 1; i < results.drawdowns.length; i++) {
                          path += ` L ${i} ${normalize(results.drawdowns[i])}`;
                        }
                        return <path d={path} fill="none" stroke="#ff4136" strokeWidth="0.5" />;
                      })()}
                    </svg>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TradingSystemAnalyzer;
