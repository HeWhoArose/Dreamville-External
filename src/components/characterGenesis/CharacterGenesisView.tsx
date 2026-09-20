              {extractionError && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{extractionError}</span>
                </div>
              )}

              <div className="pt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-neutral-400">
                  {userEditedFields.size > 0 && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Edit3 className="w-3.5 h-3.5" />
                      {userEditedFields.size} custom field(s) will be strictly preserved during re-extraction
                    </span>
                  )}
                  </div>

                  <button
                    type="button"
                    id="btn-extract-character"
                    onClick={() => handleExtractCharacter()}
                    disabled={isExtracting || !naturalConcept.trim() || Boolean(deterministicFallbackPrompt)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors shadow-sm"
                  >
                  {isExtracting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Character Dossier...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Extract & Generate Character</span>
                    </>
                  )}
                </button>
                </div>

                {isExtracting && (
                  <div className="mt-3 w-full max-w-xl rounded-lg border border-indigo-900/70 bg-indigo-950/25 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs text-indigo-200">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:300ms]" />
                      </span>
                      <span>{extractionActivity || 'Working on your character...'}</span>
                      <span className="ml-auto text-[10px] text-indigo-300/70">{extractionElapsedSeconds}s</span>
                    </div>
                    {extractionModel && (
                      <div className="mt-1 text-[10px] text-neutral-400">
                        Active AI model: <span className="font-mono text-neutral-300">{extractionModel}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* World Context Snapshot Card */}
            <div className="p-5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 space-y-3">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-neutral-400" />
                World Canonical Context
              </h3>