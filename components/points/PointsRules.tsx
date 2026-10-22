import React from 'react';

/** 积分标准（员工、HR、员工档案都看同一份） */
const RULES: [string, string, string][] = [
    ['任务完成率', '30', '派给你的任务，每一期算一次；迟交但有交回也算完成'],
    ['出勤', '25', '迟到 −2、早退 −2、缺勤 −5（主管已豁免的迟到不扣）'],
    ['个人卫生', '20', '主管每周评 1–5 分；平均 3 分 = 满分，2 分 = 10，1 分 = 0'],
    ['会议出席', '10', '开始后 10 分钟内签到 = 合格；更晚 −3；没来 −5'],
    ['纪律', '15', '警告 −5；黄色警告 −10、下个月 −5；红色警告 −50 起每月少 10（5 个月）'],
    ['加分', '+', '表扬 +15；卫生 4 分 +1、5 分 +2'],
];

export const PointsRules: React.FC<{ className?: string }> = ({ className }) => <details className={`rounded-xl bg-stone-50 border border-stone-200 px-3 py-2 ${className || ''}`}>
    <summary className="text-xs font-black text-stone-600 cursor-pointer">积分标准（每月，满分 100）</summary>
    <table className="w-full mt-2 text-xs"><tbody>
        {RULES.map(([k, max, desc]) => <tr key={k} className="border-t border-stone-200 align-top">
            <td className="py-1.5 pr-2 font-black text-stone-800 whitespace-nowrap">{k}</td>
            <td className="py-1.5 pr-2 font-black tabular-nums text-stone-500">{max}</td>
            <td className="py-1.5 text-stone-600">{desc}</td>
        </tr>)}
    </tbody></table>
    <p className="mt-2 text-[11px] text-stone-500">等级：A 90 分以上 · B 75–89 · C 60–74 · D 60 以下。兼职不评。技能星级是个人能力，不算积分。</p>
</details>;
