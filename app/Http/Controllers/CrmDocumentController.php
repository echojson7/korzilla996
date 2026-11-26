<?php

namespace App\Http\Controllers;

use App\Models\CrmDeal;
use App\Models\User;
use App\Support\Access;
use App\Support\DealAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/** Документы CRM (из шаблонов Битрикс24): список для карточки и файл. */
class CrmDocumentController extends Controller
{
    public static function of(string $type, int $id): array
    {
        return DB::table('crm_documents')->where('owner_type', $type)->where('owner_id', $id)->orderByDesc('created_at')->orderByDesc('id')->limit(200)->get()
            ->map(fn ($one) => [
                'id' => (int) $one->id, 'title' => $one->title, 'number' => $one->number, 'template' => $one->template,
                'file' => $one->path ? ['name' => $one->file_name, 'mime' => $one->mime, 'size' => (int) $one->size] : null,
                'createdAt' => $one->created_at ? \Illuminate\Support\Carbon::parse($one->created_at)->toIso8601String() : null,
                'creatorId' => $one->creator_id ? (int) $one->creator_id : null,
            ])->all();
    }

    public function file(Request $request, int $document): Response
    {
        /** @var User|null $me */
        $me = $request->user();
        abort_unless($me && $me->is_active, 401);
        abort_unless(Access::allows($me, 'crm', 'view'), 403, 'Нет доступа к CRM');
        $one = DB::table('crm_documents')->where('id', $document)->first();
        abort_unless($one && $one->path && Storage::disk('local')->exists($one->path), 404, 'Файла нет');
        if ($one->owner_type === 'deal') {
            $deal = CrmDeal::query()->find($one->owner_id);
            abort_unless($deal && DealAccess::can($me, 'view', $deal), 403, 'Нет доступа к сделке');
        } else {
            abort_unless(Access::level($me, 'crm', 'view') === 'all', 403, 'Нет доступа');
        }
        $inline = $one->mime === 'application/pdf' && ! $request->boolean('download');

        return Storage::disk('local')->response($one->path, $one->file_name, ['Content-Type' => $one->mime ?: 'application/octet-stream'], $inline ? 'inline' : 'attachment');
    }
}
