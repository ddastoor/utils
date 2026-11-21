# IN PROGRESS (21 Nov 2026) — engine adapters for driver.py that are not in it yet: F5-TTS, VibeVoice (Kyutai TTS 1.6B
# went into driver.py on 21 Nov 2026).
# They go into src/lib/offline-tts/driver.py (before @engine('qwen')) together with their entries in
# scripts/make-offline-tts-catalogue.py and ENGINE_ORDER in src/lib/offline-tts/plan.ts — the unit suite demands that
# driver.py's engines and the planner's are the same, so they wait here until then. Not run by anything.
# flake8: noqa

def read_wav_torch(path, *a, **k):
    """torchaudio.load without torchcodec: torchaudio ≥ 2.9 decodes through torchcodec, which needs FFmpeg installed
    on the system. soundfile reads a WAV by itself."""
    import soundfile as sf
    import torch
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    return torch.from_numpy(x.T.copy()), sr


VOCOS_24K = ('charactr/vocos-mel-24khz', '0feb3fdd929bcd6649e0e7c5a688cf7dd012ef21')
QWEN25_TOKENIZER = ('Qwen/Qwen2.5-1.5B', '8faed761d45a263340a0528343f099c05c9a4323')


@engine('f5')
def f5(job, voices):
    """F5-TTS v1 (SWivid; code MIT, model CC BY-NC — personal use) through the f5-tts package: the voice of a recording,
    with the words said in it (the catalogue carries a transcript of each clip, made with Whisper; nothing is
    transcribed on this computer). Vocos 24 kHz (MIT) turns its spectrograms into sound."""
    import numpy as np
    import torch
    import torchaudio
    torchaudio.load = read_wav_torch
    from f5_tts.api import F5TTS
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['F5TTS_v1_Base/model_1250000.safetensors', 'F5TTS_v1_Base/vocab.txt'])
    voc = fetch(VOCOS_24K[0], VOCOS_24K[1], ['config.yaml', 'pytorch_model.bin'])
    tts = F5TTS(model='F5TTS_v1_Base', ckpt_file=os.path.join(d, 'F5TTS_v1_Base', 'model_1250000.safetensors'),
                vocab_file=os.path.join(d, 'F5TTS_v1_Base', 'vocab.txt'), vocoder_local_path=voc)
    for v in voices:
        t0 = time.time()
        wav, sr, _ = tts.infer(ref_file=clip(v), ref_text=v['clip']['text'], gen_text=spoken(job['text']), speed=float(job['speed']),
                               seed=v.get('seed', 0), show_info=lambda *a, **k: None)
        secs = write_audio(os.path.join(job['out'], v['id']), np.asarray(wav, dtype=np.float32).reshape(-1), sr, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')


@engine('vibevoice')
def vibevoice(job, voices):
    """Microsoft's VibeVoice 1.5B (MIT) through the vibevoice package of its makers: long-form speech in the voice of a
    recording. Its text tokenizer is Qwen2.5's, fetched at a fixed revision (the package would take the newest). On a
    processor slow; with an NVIDIA card it runs in bfloat16."""
    import numpy as np
    import torch
    import librosa
    from vibevoice.modular.modeling_vibevoice_inference import VibeVoiceForConditionalGenerationInference
    from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f'  (on the {"graphics card" if device == "cuda" else "processor — this takes a long while"})')
    v0 = voices[0]
    d = fetch(v0['repo'], v0['rev'], ['config.json', 'preprocessor_config.json', 'model-*.safetensors', 'model.safetensors.index.json'])
    tok = fetch(QWEN25_TOKENIZER[0], QWEN25_TOKENIZER[1], ['tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt'])
    # the processor reads its tokenizer's name from preprocessor_config.json: a copy that names the fetched folder
    pdir = os.path.join(MODELS, 'vibevoice-processor')
    os.makedirs(pdir, exist_ok=True)
    pc = json.load(open(os.path.join(d, 'preprocessor_config.json'), encoding='utf-8'))
    pc['language_model_pretrained_name'] = tok
    json.dump(pc, open(os.path.join(pdir, 'preprocessor_config.json'), 'w', encoding='utf-8'))
    processor = VibeVoiceProcessor.from_pretrained(pdir)
    model = VibeVoiceForConditionalGenerationInference.from_pretrained(
        d, torch_dtype=torch.bfloat16 if device == 'cuda' else torch.float32, device_map=device, attn_implementation='sdpa').eval()
    model.set_ddpm_inference_steps(num_steps=10)
    for v in voices:
        t0 = time.time()
        ref, _ = librosa.load(clip(v), sr=24000, mono=True)
        parts = []
        for c in chunks(spoken(job['text']), 1000):
            torch.manual_seed(v.get('seed', 0))
            inputs = processor(text=[f'Speaker 1: {c}'], voice_samples=[[ref]], padding=True, return_tensors='pt', return_attention_mask=True)
            inputs = {k: (x.to(device) if torch.is_tensor(x) else x) for k, x in inputs.items()}
            with torch.inference_mode():
                out = model.generate(**inputs, max_new_tokens=None, cfg_scale=1.3, tokenizer=processor.tokenizer,
                                     generation_config={'do_sample': False}, verbose=False)
            if out.speech_outputs and out.speech_outputs[0] is not None:
                parts.append(out.speech_outputs[0].reshape(-1).float().cpu().numpy())
                parts.append(silence(24000, 0.25))
        secs = write_audio(os.path.join(job['out'], v['id']), np.concatenate(parts) if parts else silence(24000, 0.1), 24000, job.get('mp3', True))
        log(f'  {v["label"]}: {secs:.1f} s of speech in {time.time() - t0:.1f} s')

