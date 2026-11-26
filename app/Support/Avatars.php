<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Аватары сотрудников. Картинка приходит уже обрезанной в квадрат
 * (кроп в браузере), сервер всё равно режет по центру на случай другой
 * пропорции, перекодирует (без EXIF и прочего мусора) и кладёт набор
 * размеров: каждому месту — свой, ничего лишнего не качается.
 *
 * Файлы: avatars/{id}/{версия}-{размер}.webp на диске local. Версия —
 * в адресе картинки, поэтому браузер кэширует её навсегда, а новая
 * загрузка сразу видна всем.
 */
class Avatars
{
    /** 64 — списки и упоминания, 128 — чаты и карточки, 256 и 512 — профиль. */
    public const SIZES = [64, 128, 256, 512];

    public static function store(User $user, UploadedFile $file): void
    {
        self::storeBytes($user, (string) file_get_contents($file->getRealPath()));
    }

    /** То же из байтов картинки (перенос фото из Битрикс24). */
    public static function storeBytes(User $user, string $bytes): void
    {
        $source = @imagecreatefromstring($bytes);
        if (! $source) {
            throw ValidationException::withMessages(['avatar' => 'Не получилось прочитать картинку']);
        }
        $width = imagesx($source);
        $height = imagesy($source);
        if ($width < 32 || $height < 32) {
            throw ValidationException::withMessages(['avatar' => 'Картинка слишком маленькая']);
        }
        $side = min($width, $height);
        $x = intdiv($width - $side, 2);
        $y = intdiv($height - $side, 2);

        $version = base_convert((string) (int) (microtime(true) * 1000), 10, 36);
        $ext = self::ext();
        $disk = Storage::disk('local');
        foreach (self::SIZES as $size) {
            $target = imagecreatetruecolor($size, $size);
            imagealphablending($target, false);
            imagesavealpha($target, true);
            imagefill($target, 0, 0, imagecolorallocatealpha($target, 255, 255, 255, 127));
            imagecopyresampled($target, $source, 0, 0, $x, $y, $size, $size, $side, $side);
            ob_start();
            $ext === 'webp' ? imagewebp($target, null, 86) : imagepng($target, null, 7);
            $disk->put(self::path($user->id, $version, $size, $ext), (string) ob_get_clean());
            imagedestroy($target);
        }
        imagedestroy($source);

        $old = $user->avatar;
        $user->forceFill(['avatar' => $version.'.'.$ext])->save();
        if ($old) {
            self::forget($user->id, $old);
        }
    }

    public static function delete(User $user): void
    {
        if ($user->avatar) {
            self::forget($user->id, $user->avatar);
            $user->forceFill(['avatar' => null])->save();
        }
    }

    /** Путь картинки на диске или null, если такой нет. */
    public static function file(User $user, string $version, int $size): ?string
    {
        if (! $user->avatar || ! str_starts_with($user->avatar, $version.'.')) {
            return null;
        }
        $size = collect(self::SIZES)->first(fn ($one) => $one >= $size) ?? max(self::SIZES);
        [, $ext] = explode('.', $user->avatar, 2);
        $path = self::path($user->id, $version, $size, $ext);

        return Storage::disk('local')->exists($path) ? $path : null;
    }

    /** Адрес для приложения без размера: «avatars/5/m3x1k2»; размер — последним куском. */
    public static function url(User $user): ?string
    {
        return $user->avatar ? 'avatars/'.$user->id.'/'.explode('.', $user->avatar, 2)[0] : null;
    }

    private static function forget(int $userId, string $stored): void
    {
        [$version, $ext] = array_pad(explode('.', $stored, 2), 2, 'webp');
        Storage::disk('local')->delete(array_map(fn ($size) => self::path($userId, $version, $size, $ext), self::SIZES));
    }

    private static function path(int $userId, string $version, int $size, string $ext): string
    {
        return "avatars/{$userId}/{$version}-{$size}.{$ext}";
    }

    /** WebP, если PHP его умеет; иначе PNG. */
    private static function ext(): string
    {
        return function_exists('imagewebp') && (gd_info()['WebP Support'] ?? false) ? 'webp' : 'png';
    }
}
