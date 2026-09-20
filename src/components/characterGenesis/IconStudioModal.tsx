import React, { useState, useRef } from 'react';
import { CharacterSkill, StartingEquipmentItem, ItemOrSkillIcon } from '../../types';
import { generateIconPrompt, getDefaultIconForSkill, getDefaultIconForEquipment } from '../../data/iconSystem';
import { apiClient } from '../../services/apiClient';
import { getImageAssetSpec } from '../../data/imageAssetSpecs';
import { normalizeImageFile, normalizeImageUrl } from '../../utils/imageAssetNormalizer';
import { Sparkles, Upload, RotateCcw, Check, X, Loader2, Image as ImageIcon } from 'lucide-react';

interface IconStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetItemOrSkill: CharacterSkill | StartingEquipmentItem | null;
  targetType: 'SKILL' | 'EQUIPMENT';
  worldTitle?: string;
  onSaveIcon: (updatedIcon: ItemOrSkillIcon) => void;
}

export const IconStudioModal: React.FC<IconStudioModalProps> = ({
  isOpen,
  onClose,
  targetItemOrSkill,
  targetType,
  worldTitle,
  onSaveIcon,
}) => {
  if (!isOpen || !targetItemOrSkill) return null;

  const defaultIcon =
    targetType === 'SKILL'
      ? getDefaultIconForSkill(targetItemOrSkill as CharacterSkill)
      : getDefaultIconForEquipment(targetItemOrSkill as StartingEquipmentItem);

  const currentIcon: ItemOrSkillIcon = targetItemOrSkill.icon || defaultIcon;

  const [prompt, setPrompt] = useState<string>(
    currentIcon.prompt || generateIconPrompt(targetItemOrSkill, targetType, worldTitle)
  );
  const [workingIcon, setWorkingIcon] = useState<ItemOrSkillIcon>(currentIcon);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isNormalizing, setIsNormalizing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.generateImage({
        prompt: prompt.trim(),
        aspectRatio: '1:1',
        slotType: targetType === 'SKILL' ? 'skill_icon' : 'equipment',
        tags: [targetType.toLowerCase(), 'icon'],
      });

      if (res && res.imageUrl) {
        setIsNormalizing(true);
        const normalized = await normalizeImageUrl(res.imageUrl, getImageAssetSpec(targetType === 'SKILL' ? 'skill_icon' : 'equipment'));
        setWorkingIcon({
          source: 'AI_GENERATED',
          status: 'READY',
          url: normalized.dataUrl,
          prompt: prompt.trim(),
          alt: `${targetItemOrSkill.name} Icon`,
        });
      } else {
        setErrorMessage(res?.errorReason || 'Image generation returned no image URL.');
      }
    } catch (err: any) {
      console.error('Failed to generate icon image:', err);
      setErrorMessage(err?.message || 'Failed to generate image icon.');
    } finally {
      setIsNormalizing(false);
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    setIsNormalizing(true);
    setErrorMessage(null);
    try {
      const normalized = await normalizeImageFile(file, getImageAssetSpec(targetType === 'SKILL' ? 'skill_icon' : 'equipment'));
      setWorkingIcon({
        source: 'IMPORTED',
        status: 'READY',
        url: normalized.dataUrl,
        alt: targetItemOrSkill.name + ' Icon (Imported)',
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not normalize the imported icon.');
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleRestoreDefault = () => {
    setWorkingIcon(defaultIcon);
    setPrompt(generateIconPrompt(targetItemOrSkill, targetType, worldTitle));
    setErrorMessage(null);
  };

  const handleApply = () => {
    onSaveIcon(workingIcon);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold tracking-wide">Icon Studio</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Item Info */}
        <div className="text-sm text-slate-300">
          Editing icon for <span className="font-semibold text-amber-300">{targetItemOrSkill.name}</span>{' '}
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-mono">
            {targetType}
          </span>
        </div>

        {/* Preview Area */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-950/60 rounded-xl border border-slate-800 gap-3">
          <div className="relative w-24 h-24 rounded-2xl border-2 border-amber-500/40 bg-slate-900 flex items-center justify-center shadow-inner overflow-hidden">
            {isGenerating ? (
              <div className="flex flex-col items-center gap-2 text-amber-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-[10px] uppercase tracking-wider font-mono">Generating...</span>
              </div>
            ) : workingIcon.url ? (
              <img
                src={workingIcon.url}
                alt={workingIcon.alt || targetItemOrSkill.name}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <span className="text-4xl select-none">{workingIcon.emoji || defaultIcon.emoji || '✨'}</span>
            )}
          </div>

          <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
            <span>Source:</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold">
              {workingIcon.source}
            </span>
          </div>
        </div>

        {/* Error alert */}
        {errorMessage && (
          <div className="p-3 text-xs bg-red-950/80 border border-red-800/80 rounded-lg text-red-200">
            {errorMessage}
          </div>
        )}

        {/* AI Prompt Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300">AI Prompt Generator</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/70 transition resize-none font-sans"
            placeholder="Describe the icon style, subject, and lighting..."
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 disabled:opacity-50 transition shadow-md"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate AI Icon
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="py-2 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Upload className="w-3.5 h-3.5 text-slate-400" />
              Import File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={handleRestoreDefault}
              className="py-2 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              Restore Default
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4 mt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-100 flex items-center gap-1.5 transition shadow-sm"
          >
            <Check className="w-4 h-4" />
            Apply Icon
          </button>
        </div>
      </div>
    </div>
  );
};
